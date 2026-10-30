import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clip,
  formatCommit,
  normalizeSubject,
  parseCommit,
  splitHeadline,
  stripFences,
} from "../src/format.ts";
import type { ProposedMessage } from "../src/types.ts";

function msg(partial: Partial<ProposedMessage> = {}): ProposedMessage {
  return {
    type: "feat",
    subject: "add login",
    breaking: false,
    engine: "heuristic",
    ...partial,
  };
}

describe("formatCommit", () => {
  it("formats type and subject", () => {
    assert.equal(formatCommit(msg()), "feat: add login");
  });

  it("includes scope", () => {
    assert.equal(
      formatCommit(msg({ scope: "auth" })),
      "feat(auth): add login",
    );
  });

  it("marks breaking changes", () => {
    assert.equal(
      formatCommit(msg({ scope: "api", breaking: true })),
      "feat(api)!: add login",
    );
  });

  it("keeps breaking bang with a BREAKING CHANGE body footer", () => {
    assert.equal(
      formatCommit(
        msg({
          scope: "api",
          breaking: true,
          body: "BREAKING CHANGE: remove public export login",
        }),
      ),
      "feat(api)!: add login\n\nBREAKING CHANGE: remove public export login",
    );
  });

  it("appends a body after a blank line", () => {
    assert.equal(
      formatCommit(msg({ body: "Keep tokens rotating." })),
      "feat: add login\n\nKeep tokens rotating.",
    );
  });
});

describe("normalizeSubject", () => {
  it("lowercases a leading capital, strips a trailing period, and collapses space", () => {
    assert.equal(normalizeSubject("  Add Login.  "), "add Login");
  });

  it("keeps ALLCAPS tokens", () => {
    assert.equal(normalizeSubject("Fix JWT refresh"), "fix JWT refresh");
  });

  it("falls back when empty", () => {
    assert.equal(normalizeSubject("   "), "update project files");
  });
});

describe("parseCommit", () => {
  it("parses a conventional header and body", () => {
    const parsed = parseCommit(
      "fix(parser): handle empty hunks\n\nAvoid crashing on binary files.",
      "ai",
    );
    assert.deepEqual(parsed, {
      type: "fix",
      scope: "parser",
      subject: "handle empty hunks",
      body: "Avoid crashing on binary files.",
      breaking: false,
      engine: "ai",
    });
  });

  it("reads fenced model output", () => {
    const parsed = parseCommit("```\nfeat: add heuristic engine\n```");
    assert.equal(parsed?.type, "feat");
    assert.equal(parsed?.subject, "add heuristic engine");
  });

  it("returns null for unstructured text", () => {
    assert.equal(parseCommit("just a sentence"), null);
  });
});

describe("helpers", () => {
  it("clips on a word boundary", () => {
    const long = "update the authentication session refresh token rotation helper";
    const clipped = clip(long, 40);
    assert.ok(clipped.length <= 40);
    assert.ok(clipped.endsWith("…"));
    assert.equal(clipped.includes("  "), false);
  });

  it("strips markdown fences and labels", () => {
    assert.equal(
      stripFences("Commit message:\n```md\nfeat: add x\n```"),
      "feat: add x",
    );
  });

  it("splits headline and body", () => {
    assert.deepEqual(splitHeadline("feat: add x\n\nbody"), {
      headline: "feat: add x",
      body: "body",
    });
  });
});
