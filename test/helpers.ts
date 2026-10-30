import type { DiffHunk, StagedDiff, StagedFile, FileStatus } from "../src/types.ts";

export function stagedFile(
  partial: Partial<StagedFile> & { path: string },
): StagedFile {
  return {
    status: "M",
    additions: 8,
    deletions: 2,
    ...partial,
  };
}

export function hunk(path: string, lines: string[]): DiffHunk {
  return {
    path,
    header: "@@ -1,3 +1,6 @@",
    lines,
  };
}

export function stagedDiff(
  files: StagedFile[],
  hunks: DiffHunk[] = [],
  raw = "",
): StagedDiff {
  return { files, hunks, raw };
}

export function addedLines(path: string, source: string): DiffHunk {
  const lines = source.split("\n").map((line) => `+${line}`);
  return hunk(path, lines);
}

export function deletedLines(path: string, source: string): DiffHunk {
  const lines = source.split("\n").map((line) => `-${line}`);
  return hunk(path, lines);
}

export function mixedHunk(
  path: string,
  deleted: string,
  added: string,
): DiffHunk {
  const del =
    deleted === "" ? [] : deleted.split("\n").map((line) => `-${line}`);
  const add = added === "" ? [] : added.split("\n").map((line) => `+${line}`);
  return hunk(path, [...del, ...add]);
}

export const statuses = {
  add: "A" as FileStatus,
  modify: "M" as FileStatus,
  delete: "D" as FileStatus,
  rename: "R" as FileStatus,
};
