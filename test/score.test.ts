import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMIT_TYPES, type CommitType } from "../src/types.ts";
import {
  exceedsFailAbove,
  failAboveMessage,
  riskScore,
} from "../src/score.ts";

describe("riskScore", () => {
  it("maps breaking to 100 regardless of type", () => {
    for (const type of COMMIT_TYPES) {
      assert.equal(riskScore({ type, breaking: true }), 100, type);
    }
  });

  it("maps non-breaking types to the documented 0–100 scale", () => {
    const expected: Record<CommitType, number> = {
      feat: 45,
      fix: 70,
      docs: 15,
      style: 15,
      refactor: 45,
      perf: 45,
      test: 15,
      build: 15,
      ci: 15,
      chore: 15,
    };
    for (const type of COMMIT_TYPES) {
      assert.equal(riskScore({ type, breaking: false }), expected[type], type);
    }
  });

  it("is deterministic and stays in 0–100", () => {
    for (const type of COMMIT_TYPES) {
      const a = riskScore({ type, breaking: false });
      const b = riskScore({ type, breaking: false });
      assert.equal(a, b);
      assert.ok(a >= 0 && a <= 100);
    }
  });
});

describe("exceedsFailAbove", () => {
  it("uses strict greater-than (align with llm-roast)", () => {
    assert.equal(exceedsFailAbove(70, 70), false);
    assert.equal(exceedsFailAbove(71, 70), true);
    assert.equal(exceedsFailAbove(0, 0), false);
    assert.equal(exceedsFailAbove(100, 100), false);
    assert.equal(exceedsFailAbove(100, 99), true);
  });
});

describe("failAboveMessage", () => {
  it("prints the short stderr line the CLI uses", () => {
    assert.equal(
      failAboveMessage(70, 50),
      "vibe-commit: risk score 70 exceeds --fail-above 50",
    );
  });
});
