import type { ChangeMeasure } from "./diff";

export type Sensitivity = "low" | "medium" | "high";

export const ROTATION_MEMORY = 12;
export const FLAP_WINDOW = 20;
export const FLAP_MIN_SAMPLES = 8;
export const FLAP_THRESHOLD = 0.5;

/** Per-watch alerting state. Stored as JSON on the watch row. */
export type WatchState = {
  currentHash: string | null;
  pendingHash: string | null;
  recentHashes: string[];
  /** Rolling window: true when a check saw a candidate (non-trivial) change. */
  outcomes: boolean[];
  flapping: boolean;
};

export const INITIAL_STATE: WatchState = {
  currentHash: null,
  pendingHash: null,
  recentHashes: [],
  outcomes: [],
  flapping: false,
};

export type DecisionKind =
  | "baseline" // first observation
  | "same" // nothing changed
  | "minor" // below the sensitivity threshold
  | "rotation" // returned to a recently seen version (banner/A-B rotation)
  | "pending" // looks real, waiting for a confirmation render
  | "reverted" // the confirmation render went back to the old version
  | "confirmed"; // real change

export type Decision = {
  kind: DecisionKind;
  /** Store a new version in the timeline. */
  recordVersion: boolean;
  /** Notify channels. */
  alert: boolean;
  /** Schedule an early confirmation check. */
  needsConfirm: boolean;
  next: WatchState;
};

export function isMeaningful(m: ChangeMeasure, sensitivity: Sensitivity): boolean {
  switch (sensitivity) {
    case "high":
      return m.changedTokens >= 1;
    case "medium":
      return m.changedTokens >= 2;
    case "low":
      return m.changedTokens >= 10 || (m.changedTokens >= 3 && m.ratio >= 0.05);
  }
}

/** Ordered history of the versions the page has settled on (most recent last). */
export function rememberHash(history: readonly string[], hash: string): string[] {
  return [...history, hash].slice(-ROTATION_MEMORY);
}

/**
 * A version counts as rotation only once the page has already returned to it
 * at least twice — e.g. an A/B banner flipping back and forth. A single return
 * (sold out → in stock → sold out) is a real change and alerts normally.
 */
export function isRotation(history: readonly string[], hash: string): boolean {
  return history.filter((h) => h === hash).length >= 2;
}

export function recordOutcome(outcomes: readonly boolean[], candidate: boolean): boolean[] {
  return [...outcomes, candidate].slice(-FLAP_WINDOW);
}

export function isFlapping(outcomes: readonly boolean[]): boolean {
  if (outcomes.length < FLAP_MIN_SAMPLES) return false;
  return outcomes.filter(Boolean).length / outcomes.length > FLAP_THRESHOLD;
}

export type Observation = {
  hash: string;
  /** Measured against the watch's current version (ignored when hash matches). */
  measure: ChangeMeasure;
  sensitivity: Sensitivity;
};

function finish(
  kind: DecisionKind,
  state: WatchState,
  candidate: boolean,
  flags: Partial<Pick<Decision, "recordVersion" | "alert" | "needsConfirm">> = {},
): Decision {
  const outcomes = recordOutcome(state.outcomes, candidate);
  const flapping = isFlapping(outcomes);
  return {
    kind,
    recordVersion: flags.recordVersion ?? false,
    alert: (flags.alert ?? false) && !flapping,
    needsConfirm: flags.needsConfirm ?? false,
    next: { ...state, outcomes, flapping },
  };
}

/**
 * The alerting state machine. Pure: given the current state and a fresh
 * observation, return what to do and the next state. A change is only alerted
 * once it is (1) above the sensitivity threshold, (2) not a return to a
 * recently-seen version, and (3) reproduced by a second, confirmation render.
 */
export function decide(state: WatchState, obs: Observation): Decision {
  if (state.currentHash === null) {
    return finish(
      "baseline",
      { ...state, currentHash: obs.hash, pendingHash: null, recentHashes: rememberHash(state.recentHashes, obs.hash) },
      false,
      { recordVersion: true },
    );
  }

  if (obs.hash === state.currentHash) {
    const wasPending = state.pendingHash !== null;
    return finish(wasPending ? "reverted" : "same", { ...state, pendingHash: null }, wasPending);
  }

  if (isRotation(state.recentHashes, obs.hash)) {
    // Follow the page silently so the timeline stays truthful, but never alert.
    return finish(
      "rotation",
      { ...state, currentHash: obs.hash, pendingHash: null, recentHashes: rememberHash(state.recentHashes, obs.hash) },
      true,
      { recordVersion: true },
    );
  }

  if (!isMeaningful(obs.measure, obs.sensitivity)) {
    return finish("minor", { ...state, pendingHash: null }, false);
  }

  if (state.pendingHash === obs.hash) {
    return finish(
      "confirmed",
      {
        ...state,
        currentHash: obs.hash,
        pendingHash: null,
        recentHashes: rememberHash(state.recentHashes, obs.hash),
      },
      false, // already counted when it went pending
      { recordVersion: true, alert: true },
    );
  }

  return finish("pending", { ...state, pendingHash: obs.hash }, true, { needsConfirm: true });
}
