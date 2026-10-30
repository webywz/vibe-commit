import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
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
});
