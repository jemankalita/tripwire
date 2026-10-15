export type DomainPolicy = {
  /** Minimum gap between the start of two renders on the same host. */
  minGapMs: number;
  maxConcurrent: number;
  /** Consecutive failures that open the circuit. */
  breakerThreshold: number;
  breakerCooldownMs: number;
};

export const DEFAULT_POLICY: DomainPolicy = {
  minGapMs: 10_000,
  maxConcurrent: 1,
  breakerThreshold: 5,
  breakerCooldownMs: 30 * 60_000,
};

type DomainState = {
  active: number;
  lastStart: number;
  failures: number;
  blockedUntil: number;
};

const EMPTY: DomainState = { active: 0, lastStart: Number.NEGATIVE_INFINITY, failures: 0, blockedUntil: 0 };

/**
 * Per-host politeness gate: one render at a time per host, a minimum gap
 * between renders, Retry-After cooldowns and a circuit breaker for hosts that
 * keep failing. Each update replaces the host's state record rather than
 * mutating it.
 */
export class DomainGate {
  private readonly states = new Map<string, DomainState>();

  constructor(private readonly policy: DomainPolicy = DEFAULT_POLICY) {}

  private get(host: string): DomainState {
    return this.states.get(host) ?? EMPTY;
  }

  /** Milliseconds until this host may be fetched again (0 = now). */
  waitMs(host: string, now: number): number {
    const s = this.get(host);
    if (s.active >= this.policy.maxConcurrent) return this.policy.minGapMs;
    return Math.max(0, s.blockedUntil - now, s.lastStart + this.policy.minGapMs - now);
  }

  tryAcquire(host: string, now: number): boolean {
    if (this.waitMs(host, now) > 0) return false;
    const s = this.get(host);
    this.states.set(host, { ...s, active: s.active + 1, lastStart: now });
    return true;
  }

  release(host: string, now: number, outcome: { ok: boolean; retryAfterSec?: number }): void {
    const s = this.get(host);
    const failures = outcome.ok ? 0 : s.failures + 1;
    const retryUntil = outcome.retryAfterSec ? now + outcome.retryAfterSec * 1000 : 0;
    const breakerUntil = failures >= this.policy.breakerThreshold ? now + this.policy.breakerCooldownMs : 0;
    this.states.set(host, {
      active: Math.max(0, s.active - 1),
      lastStart: s.lastStart,
      failures,
      blockedUntil: Math.max(s.blockedUntil, retryUntil, breakerUntil),
    });
  }

  snapshot(host: string): Readonly<DomainState> {
    return this.get(host);
  }
}
