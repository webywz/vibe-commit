import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  defaultLocaleFromEnv,
  defaultVibeFromEnv,
  helpText,
  parseArgs,
  UsageError,
} from "../src/parse-args.ts";
import type { ProjectConfig } from "../src/config.ts";

function createTmpDirWithConfig(config: ProjectConfig): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
  writeFileSync(
    join(tmpDir, ".vibe-commit.json"),
    JSON.stringify(config),
  );
  return tmpDir;
}

function cleanupTmpDir(tmpDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true });
}

describe("parseArgs", () => {
  it("defaults to pro vibe, en locale, and no commit", () => {
    const options = parseArgs([], {});
    assert.equal(options.vibe, "pro");
    assert.equal(options.locale, "en");
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

  it("env vibe takes precedence over project config", () => {
    const tmpDir = createTmpDirWithConfig({ vibe: "playful" });
    try {
      const options = parseArgs([], { VIBE: "terse" }, tmpDir);
      assert.equal(options.vibe, "terse", "env should win over project config");
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });

  it("project config vibe is used when env is not set", () => {
    const tmpDir = createTmpDirWithConfig({ vibe: "terse" });
    try {
      const options = parseArgs([], {}, tmpDir);
      assert.equal(options.vibe, "terse", "project config should be used when env is not set");
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });

  it("reads locale from env when flag is omitted", () => {
    assert.equal(parseArgs([], { VIBE_COMMIT_LOCALE: "zh" }).locale, "zh");
    assert.equal(parseArgs([], { VIBE_COMMIT_LOCALE: "en" }).locale, "en");
  });

  it("env locale takes precedence over project config", () => {
    const tmpDir = createTmpDirWithConfig({ locale: "zh" });
    try {
      const options = parseArgs([], { VIBE_COMMIT_LOCALE: "en" }, tmpDir);
      assert.equal(options.locale, "en", "env should win over project config");
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });

  it("project config locale is used when env is not set", () => {
    const tmpDir = createTmpDirWithConfig({ locale: "zh" });
    try {
      const options = parseArgs([], {}, tmpDir);
      assert.equal(options.locale, "zh", "project config should be used when env is not set");
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });

  it("CLI locale takes precedence over env and project config", () => {
    const tmpDir = createTmpDirWithConfig({ locale: "en" });
    try {
      const options = parseArgs(["--locale", "zh"], { VIBE_COMMIT_LOCALE: "en" }, tmpDir);
      assert.equal(options.locale, "zh", "CLI should win over env and project");
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });

  it("parses --locale flag", () => {
    assert.equal(parseArgs(["--locale", "zh"], {}).locale, "zh");
    assert.equal(parseArgs(["--locale=en"], {}).locale, "en");
  });

  it("rejects invalid locale", () => {
    assert.throws(() => parseArgs(["--locale", "fr"], {}), UsageError);
    assert.throws(() => parseArgs(["--locale", "de"], {}), UsageError);
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

describe("defaultLocaleFromEnv", () => {
  it("defaults to en", () => {
    assert.equal(defaultLocaleFromEnv({}), "en");
  });

  it("falls back to en for unknown values", () => {
    assert.equal(defaultLocaleFromEnv({ VIBE_COMMIT_LOCALE: "fr" }), "en");
    assert.equal(defaultLocaleFromEnv({ VIBE_COMMIT_LOCALE: "de" }), "en");
  });

  it("accepts zh", () => {
    assert.equal(defaultLocaleFromEnv({ VIBE_COMMIT_LOCALE: "zh" }), "zh");
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

describe("parseArgs --out", () => {
  it("parses --out flag", () => {
    assert.equal(parseArgs(["--out", "report.txt"], {}).out, "report.txt");
    assert.equal(parseArgs(["--out=/tmp/output.json"], {}).out, "/tmp/output.json");
  });

  it("rejects --out without value", () => {
    assert.throws(() => parseArgs(["--out"], {}), UsageError);
    assert.throws(() => parseArgs(["--out="], {}), UsageError);
  });

  it("rejects --out with non-propose commands", () => {
    assert.throws(() => parseArgs(["init", "--out", "file.txt"], {}), UsageError);
    assert.throws(() => parseArgs(["install", "--out", "file.txt"], {}), UsageError);
    assert.throws(() => parseArgs(["uninstall", "--out", "file.txt"], {}), UsageError);
  });

  it("allows --out with default propose command", () => {
    const options = parseArgs(["--out", "report.txt", "--no-ai"], {});
    assert.equal(options.command, "propose");
    assert.equal(options.out, "report.txt");
  });

  it("documents --out in help", () => {
    const help = helpText();
    assert.match(help, /--out/);
  });
});
