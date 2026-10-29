import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultVibeFromEnv,
  parseArgs,
  UsageError,
} from "../src/parse-args.ts";

describe("parseArgs", () => {
  it("defaults to pro vibe and no commit", () => {
    const options = parseArgs([], {});
    assert.equal(options.vibe, "pro");
    assert.equal(options.commit, false);
    assert.equal(options.dryRun, false);
    assert.equal(options.noAi, false);
  });

  it("parses long flags and equals syntax", () => {
    const options = parseArgs(
      [
        "--commit",
        "--dry-run",
        "--type=fix",
        "--scope",
        "api",
        "--vibe",
        "playful",
        "--no-ai",
        "--json",
      ],
      {},
    );
    assert.deepEqual(
      {
        commit: options.commit,
        dryRun: options.dryRun,
        type: options.type,
        scope: options.scope,
        vibe: options.vibe,
        noAi: options.noAi,
        json: options.json,
      },
      {
        commit: true,
        dryRun: true,
        type: "fix",
        scope: "api",
        vibe: "playful",
        noAi: true,
        json: true,
      },
    );
  });

  it("reads vibe from env when flag is omitted", () => {
    assert.equal(parseArgs([], { VIBE: "terse" }).vibe, "terse");
    assert.equal(
      parseArgs([], { VIBE_COMMIT_VIBE: "playful" }).vibe,
      "playful",
    );
  });

  it("rejects unknown flags and bad values", () => {
    assert.throws(() => parseArgs(["--wat"], {}), UsageError);
    assert.throws(() => parseArgs(["--type", "shipit"], {}), UsageError);
    assert.throws(() => parseArgs(["--vibe", "chaotic"], {}), UsageError);
    assert.throws(() => parseArgs(["extra"], {}), UsageError);
  });
});

describe("defaultVibeFromEnv", () => {
  it("falls back to pro for unknown values", () => {
    assert.equal(defaultVibeFromEnv({ VIBE: "LOUD" }), "pro");
  });
});
