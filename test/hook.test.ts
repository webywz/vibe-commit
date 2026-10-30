import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOOK_BEGIN,
  HOOK_END,
  hasNonCommentContent,
  installHook,
  resolveInstallCommand,
  runPrepareCommitMsg,
  shouldSkipPrepareCommitMsg,
  uninstallHook,
} from "../src/hook.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.ts");
const tsxBin = join(root, "node_modules", ".bin", "tsx");

const repos: string[] = [];

after(() => {
  for (const cwd of repos) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vibe-hook-"));
  repos.push(cwd);
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "vibe@test.local"]);
  git(cwd, ["config", "user.name", "Vibe Tester"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  // Avoid editor for commits that should open one — use env in specific tests.
  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(
    join(cwd, "src", "auth.ts"),
    "export function login() {\n  return true;\n}\n",
  );
  git(cwd, ["add", "src/auth.ts"]);
  return cwd;
}

function runCli(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      VIBE_COMMIT_VIBE: "pro",
      NO_COLOR: "1",
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("shouldSkipPrepareCommitMsg", () => {
  it("skips merge, squash, and commit sources", () => {
    assert.equal(shouldSkipPrepareCommitMsg("", "merge"), true);
    assert.equal(shouldSkipPrepareCommitMsg("", "squash"), true);
    assert.equal(shouldSkipPrepareCommitMsg("", "commit"), true);
    assert.equal(shouldSkipPrepareCommitMsg("", "MERGE"), true);
  });

  it("skips when the message already has non-comment text", () => {
    assert.equal(hasNonCommentContent("feat: hello\n"), true);
    assert.equal(
      shouldSkipPrepareCommitMsg("feat: hello\n\n# comment\n", "message"),
      true,
    );
  });

  it("allows empty or comment-only templates", () => {
    assert.equal(hasNonCommentContent(""), false);
    assert.equal(
      hasNonCommentContent("# Please enter the commit message.\n#\n"),
      false,
    );
    assert.equal(
      shouldSkipPrepareCommitMsg(
        "# Please enter the commit message.\n",
        undefined,
      ),
      false,
    );
    assert.equal(shouldSkipPrepareCommitMsg("", "template"), false);
  });
});

describe("install / uninstall", () => {
  it("installs a marked prepare-commit-msg hook and uninstall removes it", () => {
    const cwd = makeRepo();
    const command = resolveInstallCommand(cli, tsxBin);
    const installed = installHook(cwd, command);
    assert.equal(existsSync(installed.hookPath), true);
    assert.equal(installed.created, true);
    const body = readFileSync(installed.hookPath, "utf8");
    assert.match(body, new RegExp(HOOK_BEGIN));
    assert.match(body, new RegExp(HOOK_END));
    assert.match(body, /prepare-commit-msg/);

    const again = installHook(cwd, command);
    assert.equal(again.updated, true);

    const removed = uninstallHook(cwd);
    assert.equal(removed.removed, true);
    assert.equal(existsSync(installed.hookPath), false);
  });

  it("backs up a foreign hook and restores it on uninstall", () => {
    const cwd = makeRepo();
    const hooksDir = join(cwd, ".git", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const foreign = join(hooksDir, "prepare-commit-msg");
    writeFileSync(foreign, "#!/bin/sh\necho foreign-hook\n", { mode: 0o755 });
    chmodSync(foreign, 0o755);

    const command = resolveInstallCommand(cli, tsxBin);
    const installed = installHook(cwd, command);
    assert.equal(installed.backedUp, true);
    assert.equal(existsSync(join(hooksDir, "prepare-commit-msg.vibe-backup")), true);
    const body = readFileSync(installed.hookPath, "utf8");
    assert.match(body, /vibe-backup/);
    assert.match(body, new RegExp(HOOK_BEGIN));

    const removed = uninstallHook(cwd);
    assert.equal(removed.removed, true);
    assert.equal(removed.restored, true);
    assert.equal(existsSync(join(hooksDir, "prepare-commit-msg.vibe-backup")), false);
    assert.match(readFileSync(foreign, "utf8"), /foreign-hook/);
  });

  it("exposes install/uninstall via the CLI", () => {
    const cwd = makeRepo();
    const install = runCli(cwd, ["install"]);
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /hook installed|hook updated/i);
    assert.equal(
      existsSync(join(cwd, ".git", "hooks", "prepare-commit-msg")),
      true,
    );

    const uninstall = runCli(cwd, ["uninstall", "--path", cwd]);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.match(uninstall.stdout, /removed|skip/i);
  });
});

describe("runPrepareCommitMsg", () => {
  it("writes a conventional message into an empty template", async () => {
    const cwd = makeRepo();
    const msgFile = join(cwd, "COMMIT_EDITMSG");
    writeFileSync(
      msgFile,
      "\n# Please enter the commit message for your changes.\n#\n",
    );
    const result = await runPrepareCommitMsg(msgFile, undefined, cwd, {
      OPENAI_API_KEY: "",
      VIBE_COMMIT_VIBE: "pro",
    });
    assert.equal(result, "wrote");
    const written = readFileSync(msgFile, "utf8");
    assert.match(written, /^feat\(auth\): /m);
    assert.match(written, /# Please enter/);
  });

  it("skips when source is merge/squash/commit", async () => {
    const cwd = makeRepo();
    const msgFile = join(cwd, "COMMIT_EDITMSG");
    writeFileSync(msgFile, "\n# template\n");
    for (const source of ["merge", "squash", "commit"] as const) {
      const result = await runPrepareCommitMsg(msgFile, source, cwd, {
        OPENAI_API_KEY: "",
      });
      assert.equal(result, "skipped", source);
      assert.equal(readFileSync(msgFile, "utf8"), "\n# template\n");
    }
  });

  it("skips when the user already supplied a message", async () => {
    const cwd = makeRepo();
    const msgFile = join(cwd, "COMMIT_EDITMSG");
    writeFileSync(msgFile, "chore: keep me\n");
    const result = await runPrepareCommitMsg(msgFile, "message", cwd, {
      OPENAI_API_KEY: "",
    });
    assert.equal(result, "skipped");
    assert.equal(readFileSync(msgFile, "utf8"), "chore: keep me\n");
  });

  it("returns noop without staged changes instead of failing", async () => {
    const cwd = makeRepo();
    git(cwd, ["commit", "-m", "chore: seed"]);
    const msgFile = join(cwd, "COMMIT_EDITMSG");
    writeFileSync(msgFile, "\n# empty\n");
    const result = await runPrepareCommitMsg(msgFile, undefined, cwd, {
      OPENAI_API_KEY: "",
    });
    assert.equal(result, "noop");
    assert.equal(readFileSync(msgFile, "utf8"), "\n# empty\n");
  });
});

describe("hook e2e with git commit", () => {
  it("fills the message on plain git commit after install", () => {
    const cwd = makeRepo();
    const install = runCli(cwd, ["install"]);
    assert.equal(install.status, 0, install.stderr);

    // Non-interactive commit: editor writes file then exits; hook runs first.
    // Use GIT_EDITOR=true so an empty template becomes the commit after hook fills it.
    const result = spawnSync("git", ["commit", "--allow-empty-message"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_EDITOR: "true",
        GIT_COMMITTER_NAME: "Vibe Tester",
        GIT_COMMITTER_EMAIL: "vibe@test.local",
        OPENAI_API_KEY: "",
        VIBE_COMMIT_VIBE: "pro",
        NO_COLOR: "1",
      },
    });
    // --allow-empty-message is a safety net; we expect a real subject from the hook.
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const subject = git(cwd, ["log", "-1", "--pretty=%s"]).trim();
    assert.match(subject, /^feat\(auth\): /);
  });

  it("does not overwrite git commit -m", () => {
    const cwd = makeRepo();
    const install = runCli(cwd, ["install"]);
    assert.equal(install.status, 0, install.stderr);

    git(cwd, ["commit", "-m", "docs: manual message"]);
    const subject = git(cwd, ["log", "-1", "--pretty=%s"]).trim();
    assert.equal(subject, "docs: manual message");
  });
});
