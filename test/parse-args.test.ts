import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultVibeFromEnv,
  helpText,
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
    assert.equal(options.breaking, false);
    assert.equal(options.github, false);
    assert.equal(options.quiet, false);
    assert.equal(options.maxAnnotations, 20);
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
        "--breaking",
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
        breaking: options.breaking,
        json: options.json,
      },
      {
        commit: true,
        dryRun: true,
        type: "fix",
        scope: "api",
        vibe: "playful",
        noAi: true,
        breaking: true,
        json: true,
      },
    );
  });

  it("parses --breaking", () => {
    assert.equal(parseArgs(["--breaking"], {}).breaking, true);
  });

  it("reads vibe from env when flag is omitted", () => {
    assert.equal(parseArgs([], { VIBE: "terse" }).vibe, "terse");
    assert.equal(
      parseArgs([], { VIBE_COMMIT_VIBE: "playful" }).vibe,
      "playful",
    );
  });


  it("parses install and uninstall with --path", () => {
    const install = parseArgs(["install", "--path", "/tmp/repo"], {});
    assert.equal(install.command, "install");
    assert.equal(install.path, "/tmp/repo");
    const uninstall = parseArgs(["uninstall", "--path=/tmp/app"], {});
    assert.equal(uninstall.command, "uninstall");
    assert.equal(uninstall.path, "/tmp/app");
  });

  it("parses prepare-commit-msg positional args", () => {
    const options = parseArgs(
      ["prepare-commit-msg", "/tmp/COMMIT_EDITMSG", "merge"],
      {},
    );
    assert.equal(options.command, "prepare-commit-msg");
    assert.equal(options.messageFile, "/tmp/COMMIT_EDITMSG");
    assert.equal(options.commitSource, "merge");
  });

  it("rejects --path outside install/uninstall", () => {
    assert.throws(() => parseArgs(["--path", "/tmp"], {}), UsageError);
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

describe("parseArgs github / quiet / max-annotations", () => {
  it("parses --github, --quiet, and --max-annotations", () => {
    const options = parseArgs(
      ["--github", "--quiet", "--max-annotations", "8"],
      {},
    );
    assert.equal(options.github, true);
    assert.equal(options.quiet, true);
    assert.equal(options.maxAnnotations, 8);
  });

  it("parses --max-annotations= equals form", () => {
    assert.equal(parseArgs(["--max-annotations=12"], {}).maxAnnotations, 12);
  });

  it("rejects invalid --max-annotations", () => {
    assert.throws(() => parseArgs(["--max-annotations", "0"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations", "-1"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations", "1.5"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations="], {}), UsageError);
  });

  it("documents --github / --quiet / --max-annotations in help", () => {
    const help = helpText();
    assert.match(help, /--github/);
    assert.match(help, /--quiet/);
    assert.match(help, /--max-annotations/);
    assert.match(help, /GITHUB_STEP_SUMMARY/);
  });
});
