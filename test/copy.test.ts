import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { main } from "../src/cli.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vibe-commit-copy-"));
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

function captureIo<T>(fn: () => Promise<T>): Promise<{
  value: T;
  stdout: string;
  stderr: string;
}> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const outWrite = process.stdout.write.bind(process.stdout);
  const errWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    if (typeof rest[0] === "function") (rest[0] as () => void)();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    if (typeof rest[0] === "function") (rest[0] as () => void)();
    return true;
  }) as typeof process.stderr.write;
  return fn()
    .then((value) => ({
      value,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    }))
    .finally(() => {
      process.stdout.write = outWrite;
      process.stderr.write = errWrite;
    });
}

async function runMain(
  cwd: string,
  args: string[],
  copyToClipboard?: (text: string) => boolean,
): Promise<{ status: number; stdout: string; stderr: string }> {
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const captured = await captureIo(() =>
      main(args, copyToClipboard ? { copyToClipboard } : {}),
    );
    return {
      status: captured.value,
      stdout: captured.stdout,
      stderr: captured.stderr,
    };
  } finally {
    process.chdir(prev);
  }
}

describe("propose --copy", () => {
  it("invokes clipboard with the conventional commit message on success", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const calls: string[] = [];
    const result = await runMain(cwd, ["--no-ai", "--copy", "--quiet"], (text) => {
      calls.push(text);
      return true;
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.length, 1);
    assert.match(calls[0] ?? "", /^feat\(auth\): add login/);
    assert.doesNotMatch(calls[0] ?? "", /vibe-commit\s+·|riskScore|proposed/);
    assert.doesNotMatch(result.stderr, /clipboard/i);
  });

  it("with --json still copies the human title+body, not the JSON blob", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const calls: string[] = [];
    const result = await runMain(cwd, ["--no-ai", "--copy", "--json"], (text) => {
      calls.push(text);
      return true;
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.length, 1);
    const copied = calls[0] ?? "";
    assert.match(copied, /^feat\(auth\): add login/);
    assert.doesNotMatch(copied, /"type"|riskScore/);
    const payload = JSON.parse(result.stdout) as { formatted: string };
    assert.equal(copied, payload.formatted);
  });

  it("clipboard failure is silent success", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const calls: string[] = [];
    const result = await runMain(cwd, ["--no-ai", "--copy", "--quiet"], (text) => {
      calls.push(text);
      return false;
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.length, 1);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /clipboard/i);
  });

  it("clipboard throw is silent success", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = await runMain(cwd, ["--no-ai", "--copy", "--quiet"], () => {
      throw new Error("clipboard exploded");
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
  });

  it("propose without --copy does not invoke the clipboard", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    let called = false;
    const withCopyFn = await runMain(cwd, ["--no-ai", "--quiet"], () => {
      called = true;
      return true;
    });
    assert.equal(withCopyFn.status, 0, withCopyFn.stderr);
    assert.equal(called, false);

    const baseline = await runMain(cwd, ["--no-ai", "--quiet"]);
    assert.equal(baseline.status, 0, baseline.stderr);
    assert.equal(withCopyFn.stdout, baseline.stdout);
    assert.equal(withCopyFn.stderr, baseline.stderr);
  });

  it("copies after the proposal is built with --github / --fail-above / --html", async () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const calls: string[] = [];
    const result = await runMain(
      cwd,
      [
        "--no-ai",
        "--copy",
        "--github",
        "--quiet",
        "--fail-above",
        "100",
        "--html",
        join(cwd, "report.html"),
      ],
      (text) => {
        calls.push(text);
        return true;
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.length, 1);
    assert.match(calls[0] ?? "", /^feat\(auth\): add login/);
    assert.doesNotMatch(result.stderr, /clipboard/i);
  });
});
