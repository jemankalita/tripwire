import { describe, expect, it } from "vitest";
import {
  decide,
  INITIAL_STATE,
  isFlapping,
  isMeaningful,
  rememberHash,
  ROTATION_MEMORY,
  type Sensitivity,
  type WatchState,
} from "../decide";

const big = { changedTokens: 5, totalTokens: 100, ratio: 0.05 };
const tiny = { changedTokens: 1, totalTokens: 1000, ratio: 0.001 };

function run(state: WatchState, hash: string, measure = big, sensitivity: Sensitivity = "medium") {
  return decide(state, { hash, measure, sensitivity });
}

describe("decide — the alerting state machine", () => {
  it("records a baseline without alerting", () => {
    const d = run(INITIAL_STATE, "A");
    expect(d.kind).toBe("baseline");
    expect(d.recordVersion).toBe(true);
    expect(d.alert).toBe(false);
    expect(d.next.currentHash).toBe("A");
  });

  it("requires a confirmation render before alerting", () => {
    const base = run(INITIAL_STATE, "A").next;
    const pending = run(base, "B");
    expect(pending.kind).toBe("pending");
    expect(pending.needsConfirm).toBe(true);
    expect(pending.alert).toBe(false);

    const confirmed = run(pending.next, "B");
    expect(confirmed.kind).toBe("confirmed");
    expect(confirmed.alert).toBe(true);
    expect(confirmed.recordVersion).toBe(true);
    expect(confirmed.next.currentHash).toBe("B");
  });

  it("discards a change that reverts on the confirmation render", () => {
    const base = run(INITIAL_STATE, "A").next;
    const pending = run(base, "B").next;
    const reverted = run(pending, "A");
    expect(reverted.kind).toBe("reverted");
    expect(reverted.alert).toBe(false);
    expect(reverted.next.pendingHash).toBeNull();
  });

  it("never alerts on a page that differs on every load", () => {
    let state = run(INITIAL_STATE, "h0").next;
    const alerts = Array.from({ length: 30 }, (_, i) => {
      const d = run(state, `random-${i}`);
      state = d.next;
      return d.alert;
    });
    expect(alerts.every((a) => !a)).toBe(true);
    expect(state.flapping).toBe(true);
  });

  const confirm = (s: WatchState, hash: string) => run(run(s, hash).next, hash);

  it("alerts on a real return to an earlier version (sold out → in stock → sold out)", () => {
    let s = run(INITIAL_STATE, "A").next;
    s = confirm(s, "B").next;
    const back = confirm(s, "A");
    expect(back.kind).toBe("confirmed");
    expect(back.alert).toBe(true);
    const again = confirm(back.next, "B");
    expect(again.kind).toBe("confirmed");
    expect(again.alert).toBe(true);
  });

  it("treats repeated flipping between versions as rotation: tracked silently, no alert", () => {
    let s = run(INITIAL_STATE, "A").next;
    s = confirm(s, "B").next;
    s = confirm(s, "A").next;
    s = confirm(s, "B").next;
    const flip = run(s, "A"); // third visit to A
    expect(flip.kind).toBe("rotation");
    expect(flip.alert).toBe(false);
    expect(flip.recordVersion).toBe(true);
    expect(flip.next.currentHash).toBe("A");
  });

  it("ignores changes below the sensitivity threshold", () => {
    const base = run(INITIAL_STATE, "A").next;
    expect(run(base, "B", tiny, "low").kind).toBe("minor");
    expect(run(base, "B", tiny, "high").kind).toBe("pending");
  });

  it("reports unchanged pages as same", () => {
    const base = run(INITIAL_STATE, "A").next;
    expect(run(base, "A").kind).toBe("same");
  });

  it("mutes alerts but still records versions while flapping", () => {
    const flappy: WatchState = { ...run(INITIAL_STATE, "A").next, outcomes: Array(20).fill(true), pendingHash: "B" };
    const d = run(flappy, "B");
    expect(d.kind).toBe("confirmed");
    expect(d.recordVersion).toBe(true);
    expect(d.alert).toBe(false);
  });
});

describe("helpers", () => {
  it("thresholds by sensitivity", () => {
    expect(isMeaningful({ changedTokens: 1, totalTokens: 10, ratio: 0.1 }, "high")).toBe(true);
    expect(isMeaningful({ changedTokens: 1, totalTokens: 10, ratio: 0.1 }, "medium")).toBe(false);
    expect(isMeaningful({ changedTokens: 2, totalTokens: 10, ratio: 0.2 }, "medium")).toBe(true);
    expect(isMeaningful({ changedTokens: 3, totalTokens: 1000, ratio: 0.003 }, "low")).toBe(false);
    expect(isMeaningful({ changedTokens: 3, totalTokens: 50, ratio: 0.06 }, "low")).toBe(true);
    expect(isMeaningful({ changedTokens: 12, totalTokens: 5000, ratio: 0.002 }, "low")).toBe(true);
  });

  it("keeps a capped, ordered visit history", () => {
    const many = Array.from({ length: 20 }, (_, i) => `h${i}`).reduce<string[]>((acc, h) => rememberHash(acc, h), []);
    expect(many).toHaveLength(ROTATION_MEMORY);
    expect(many.at(-1)).toBe("h19");
    expect(rememberHash(["a", "b"], "a")).toEqual(["a", "b", "a"]);
  });

  it("needs enough samples before calling a page flapping", () => {
    expect(isFlapping([true, true, true])).toBe(false);
    expect(isFlapping(Array(10).fill(true))).toBe(true);
    expect(isFlapping([...Array(8).fill(false), true, true])).toBe(false);
  });
});
