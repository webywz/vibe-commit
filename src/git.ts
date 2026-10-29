import { execFileSync } from "node:child_process";
import { assembleDiff } from "./parse-diff.ts";
import type { StagedDiff } from "./types.ts";

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

export function inspectStaged(cwd = process.cwd()): StagedDiff {
  assertRepo(cwd);
  const nameStatus = git(["diff", "--cached", "--name-status", "-M"], cwd);
  const numstat = git(["diff", "--cached", "--numstat", "-M"], cwd);
  const raw = git(["diff", "--cached", "-M", "--unified=3"], cwd);
  const diff = assembleDiff(nameStatus, numstat, raw);
  if (diff.files.length === 0) {
    throw new GitError(
      "No staged changes. Stage files first: git add -p  (or git add <path>)",
    );
  }
  return diff;
}

export function commitWithMessage(
  message: string,
  cwd = process.cwd(),
): string {
  assertRepo(cwd);
  const [headline, ...rest] = message.split("\n");
  const body = rest.join("\n").trim();
  const args = ["commit", "-m", headline ?? message];
  if (body) args.push("-m", body);
  return git(args, cwd);
}

export function assertRepo(cwd = process.cwd()): void {
  try {
    const inside = git(["rev-parse", "--is-inside-work-tree"], cwd).trim();
    if (inside !== "true") throw new Error("not a repo");
  } catch {
    throw new GitError("Not a git repository. Run this inside a project with git.");
  }
}

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : "";
    const detail = stderr.trim() || (error instanceof Error ? error.message : "git failed");
    throw new GitError(detail);
  }
}
