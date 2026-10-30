import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.ts");
const tsxBin = join(root, "node_modules", ".bin", "tsx");

function run(
  cwd: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin, [cli, ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        VIBE_COMMIT_VIBE: "pro",
        NO_COLOR: "1",
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vibe-commit-"));
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "vibe@test.local"]);
  git(cwd, ["config", "user.name", "Vibe Tester"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(
    join(cwd, "src", "auth.ts"),
    "export function login() {\n  return true;\n}\n",
  );
  git(cwd, ["add", "src/auth.ts"]);
  return cwd;
}

const repos: string[] = [];

after(() => {
  for (const cwd of repos) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe("cli e2e", () => {
  it("prints a conventional message from a staged file", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^(feat|fix|docs|chore)\b/);
    assert.match(result.stdout, /feat\(auth\): add login/);
  });

  it("honors --type, --scope, and --json", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--type",
      "fix",
      "--scope",
      "api",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      type: string;
      scope: string;
      formatted: string;
    };
    assert.equal(payload.type, "fix");
    assert.equal(payload.scope, "api");
    assert.match(payload.formatted, /^fix\(api\): /);
  });

  it("commits with --commit and skips commit on --dry-run", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const dry = run(cwd, ["--no-ai", "--commit", "--dry-run"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.throws(() => git(cwd, ["log", "-1"]));

    const committed = run(cwd, ["--no-ai", "--commit"]);
    assert.equal(committed.status, 0, committed.stderr);
    const subject = git(cwd, ["log", "-1", "--pretty=%s"]).trim();
    assert.match(subject, /^feat\(auth\): /);
  });

  it("fails clearly with nothing staged", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    git(cwd, ["commit", "-m", "chore: seed"]);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No staged changes/);
    assert.match(result.stderr, /暂存区为空/);
  });

  it("exposes breakingReason in --json when forced", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--breaking", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      breaking: boolean;
      breakingReason?: string;
      formatted: string;
    };
    assert.equal(payload.breaking, true);
    assert.match(payload.breakingReason ?? "", /--breaking/);
    assert.match(payload.formatted, /!/);
    assert.match(payload.formatted, /BREAKING CHANGE:/);
  });

  it("fails outside a git repository", () => {
    const cwd = mkdtempSync(join(tmpdir(), "vibe-commit-nongit-"));
    repos.push(cwd);
    const result = run(cwd, ["--help"]);
    assert.equal(result.status, 0);
    const fail = run(cwd);
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /Not a git repository/);
  });

  it("prints help and version", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage/);
    const version = run(cwd, ["--version"]);
    assert.equal(version.status, 0);
    assert.match(version.stdout, /vibe-commit \d+\.\d+\.\d+/);
  });

  it("emits GitHub annotations with --github --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const dir = mkdtempSync(join(tmpdir(), "vibe-commit-gh-e2e-"));
    repos.push(dir);
    const outFile = join(dir, "github_output");
    const sumFile = join(dir, "step_summary.md");
    const result = run(
      cwd,
      ["--no-ai", "--github", "--quiet", "--max-annotations", "5"],
      { GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: sumFile },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^::(notice|warning|error) /m);
    assert.doesNotMatch(result.stdout, /proposed|next  vibe-commit/);
    const outputs = readFileSync(outFile, "utf8");
    assert.match(outputs, /^title=/m);
    assert.match(outputs, /^findings=/m);
    const summary = readFileSync(sumFile, "utf8");
    assert.match(summary, /## vibe-commit/);
  });

  it("keeps --json stdout clean when combined with --github", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--github", "--json", "--quiet"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { formatted: string };
    assert.match(payload.formatted, /feat\(auth\):/);
    assert.match(result.stderr, /^::(notice|warning|error) /m);
  });

  it("init --json outputs machine-readable result (bare)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["init", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      manager: string;
      targetPath: string;
      created: boolean;
      updated: boolean;
      backedUp: boolean;
    };
    assert.equal(payload.manager, "bare");
    assert.match(payload.targetPath, /prepare-commit-msg$/);
    assert.equal(payload.created, true);
    assert.equal(payload.updated, false);
    assert.equal(payload.backedUp, false);
  });

  it("init --json reports update when already managed", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const first = run(cwd, ["init", "--json"]);
    assert.equal(first.status, 0, first.stderr);
    const second = run(cwd, ["init", "--json"]);
    assert.equal(second.status, 0, second.stderr);
    const payload = JSON.parse(second.stdout) as {
      created: boolean;
      updated: boolean;
    };
    assert.equal(payload.created, false);
    assert.equal(payload.updated, true);
  });

  it("init without --json keeps pretty output", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["init"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ok.*prepare-commit-msg/);
    assert.match(result.stdout, /Next steps/);
    assert.match(result.stdout, /后续步骤/);
  });

  it("install --json outputs machine-readable result", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["install", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      action: string;
      manager: string;
      path: string;
      hookPath: string;
      created: boolean;
      updated: boolean;
      backedUp: boolean;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.action, "installed");
    assert.equal(payload.manager, "bare");
    assert.match(payload.path, /prepare-commit-msg$/);
    assert.match(payload.hookPath, /prepare-commit-msg$/);
    assert.equal(payload.created, true);
    assert.equal(payload.updated, false);
    assert.equal(payload.backedUp, false);
  });

  it("install --json reports update when already installed", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const first = run(cwd, ["install", "--json"]);
    assert.equal(first.status, 0, first.stderr);
    const second = run(cwd, ["install", "--json"]);
    assert.equal(second.status, 0, second.stderr);
    const payload = JSON.parse(second.stdout) as {
      ok: boolean;
      action: string;
      created: boolean;
      updated: boolean;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.action, "updated");
    assert.equal(payload.created, false);
    assert.equal(payload.updated, true);
  });

  it("uninstall --json outputs machine-readable result", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    run(cwd, ["install"]);
    const result = run(cwd, ["uninstall", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      action: string;
      manager: string;
      path: string;
      hookPath: string;
      removed: boolean;
      restored: boolean;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.action, "removed");
    assert.equal(payload.manager, "bare");
    assert.match(payload.path, /prepare-commit-msg$/);
    assert.match(payload.hookPath, /prepare-commit-msg$/);
    assert.equal(payload.removed, true);
    assert.equal(payload.restored, false);
  });

  it("uninstall --json reports skipped when no hook found", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["uninstall", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      action: string;
      removed: boolean;
      restored: boolean;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.action, "skipped");
    assert.equal(payload.removed, false);
    assert.equal(payload.restored, false);
  });

  it("install without --json keeps pretty output", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["install"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ok.*prepare-commit-msg hook installed/);
    assert.match(result.stdout, /tip: plain/);
  });

  it("uninstall without --json keeps pretty output", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    run(cwd, ["install"]);
    const result = run(cwd, ["uninstall"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ok.*prepare-commit-msg hook removed/);
  });

  it("--out writes text report to file", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.txt");
    const result = run(cwd, ["--no-ai", "--out", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "", "stdout should be empty when --out is used");
    const content = readFileSync(outFile, "utf8");
    assert.match(content, /vibe-commit/);
    assert.match(content, /feat\(auth\): add login/);
  });

  it("--out --json writes JSON to file and stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.json");
    const result = run(cwd, ["--no-ai", "--json", "--out", outFile]);
    assert.equal(result.status, 0, result.stderr);
    const stdoutPayload = JSON.parse(result.stdout) as { formatted: string };
    assert.match(stdoutPayload.formatted, /feat\(auth\):/);
    const fileContent = readFileSync(outFile, "utf8");
    const filePayload = JSON.parse(fileContent) as { formatted: string };
    assert.deepEqual(filePayload, stdoutPayload, "file and stdout should contain identical JSON");
  });

  it("--out with invalid path fails gracefully", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "nonexistent", "dir", "report.txt");
    const result = run(cwd, ["--no-ai", "--out", outFile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed to write --out/);
  });

});
