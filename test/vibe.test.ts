import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyVibe, pick } from "../src/vibe.ts";

describe("applyVibe", () => {
  const draft = {
    type: "feat" as const,
    scope: "cli",
    subject: "add offline heuristic commit messages",
    body: "Inspect staged diffs and suggest conventional commits.",
    breaking: false,
  };

  it("keeps a professional subject and body", () => {
    const result = applyVibe(draft, "pro");
    assert.equal(result.subject, draft.subject);
    assert.equal(result.body, draft.body);
  });

  it("shortens terse subjects and drops the body", () => {
    const result = applyVibe(draft, "terse");
    assert.ok(result.subject.length <= 50);
    assert.equal(result.body, undefined);
    assert.equal(result.subject.includes(" the "), false);
  });

  it("keeps playful output as a usable conventional subject", () => {
    const result = applyVibe(draft, "playful");
    assert.ok(result.subject.length > 0);
    assert.ok(result.subject.length <= 72);
    assert.equal(result.subject.endsWith("."), false);
  });
});

describe("pick", () => {
  it("is deterministic for a given seed", () => {
    const options = ["alpha", "beta", "gamma"];
    assert.equal(pick("seed", options), pick("seed", options));
    assert.notEqual(pick("seed-a", options), undefined);
  });
});
