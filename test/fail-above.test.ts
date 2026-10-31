import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  });
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
  const cwd = mkdtempSync(join(tmpdir(), "vibe-commit-fail-above-"));
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

describe("--fail-above CI gate", () => {
  it("lists --fail-above in help", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--fail-above/);
    assert.match(help.stdout, /riskScore/);
  });

  it("rejects bad --fail-above values with UsageError", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--fail-above", "101"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /integer from 0 to 100/);
    assert.doesNotMatch(result.stderr, /risk score/);
  });

  it("exits 0 when the flag is omitted", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { riskScore: number };
    assert.equal(payload.riskScore, 45);
  });

  it("exits 1 when score exceeds the threshold (strict >)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    // feat → 45; 44 is below the score
    const fail = run(cwd, ["--no-ai", "--fail-above", "44"]);
    assert.equal(fail.status, 1, fail.stderr);
    assert.match(fail.stderr, /risk score 45 exceeds --fail-above 44/);
    assert.match(fail.stdout, /feat\(auth\):/);
  });

  it("exits 0 when score equals the threshold", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const ok = run(cwd, ["--no-ai", "--fail-above", "45"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.doesNotMatch(ok.stderr, /exceeds --fail-above/);
  });

  it("exits 0 when score is below the threshold", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const ok = run(cwd, ["--no-ai", "--fail-above", "100"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.doesNotMatch(ok.stderr, /exceeds --fail-above/);
  });

  it("gates after --json stdout (riskScore present, then exit 1)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--json", "--fail-above", "40"]);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout) as {
      type: string;
      formatted: string;
      riskScore: number;
    };
    assert.equal(payload.type, "feat");
    assert.equal(payload.riskScore, 45);
    assert.match(payload.formatted, /^feat\(auth\): /);
    assert.match(result.stderr, /risk score 45 exceeds --fail-above 40/);
  });

  it("emits --github annotations before exit 1", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--github",
      "--quiet",
      "--fail-above",
      "40",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^::(notice|warning|error) /m);
    assert.match(result.stderr, /risk score 45 exceeds --fail-above 40/);
  });

  it("keeps --json stdout parseable when combined with --github and the gate", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--github",
      "--json",
      "--quiet",
      "--fail-above",
      "40",
    ]);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout) as { riskScore: number };
    assert.equal(payload.riskScore, 45);
    assert.match(result.stderr, /^::(notice|warning|error) /m);
    assert.match(result.stderr, /risk score 45 exceeds --fail-above 40/);
  });

  it("uses 100 for --breaking even with --fail-above 99", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--breaking",
      "--json",
      "--fail-above",
      "99",
    ]);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout) as {
      breaking: boolean;
      riskScore: number;
    };
    assert.equal(payload.breaking, true);
    assert.equal(payload.riskScore, 100);
    assert.match(result.stderr, /risk score 100 exceeds --fail-above 99/);
  });

  it("uses 70 for --type fix (exit 0 at 70, exit 1 at 69)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const ok = run(cwd, ["--no-ai", "--type", "fix", "--fail-above", "70"]);
    assert.equal(ok.status, 0, ok.stderr);
    const fail = run(cwd, ["--no-ai", "--type", "fix", "--json", "--fail-above", "69"]);
    assert.equal(fail.status, 1);
    const payload = JSON.parse(fail.stdout) as { type: string; riskScore: number };
    assert.equal(payload.type, "fix");
    assert.equal(payload.riskScore, 70);
    assert.match(fail.stderr, /risk score 70 exceeds --fail-above 69/);
  });

  it("does not gate init / install / uninstall", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const init = run(cwd, ["init", "--fail-above", "0"]);
    assert.equal(init.status, 1);
    assert.match(init.stderr, /only valid with propose/);
    assert.doesNotMatch(init.stderr, /risk score/);
  });
});
