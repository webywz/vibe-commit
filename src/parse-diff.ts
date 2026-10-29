import type { DiffHunk, FileStatus, StagedDiff, StagedFile } from "./types.ts";

const STATUS_MAP: Record<string, FileStatus> = {
  A: "A",
  M: "M",
  D: "D",
  R: "R",
  C: "C",
  T: "T",
  U: "U",
};

export function parseNameStatus(output: string): Map<string, StagedFile> {
  const files = new Map<string, StagedFile>();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Z])(\d*)\t([^\t]+)(?:\t([^\t]+))?$/);
    if (!match) continue;
    const code = match[1] ?? "M";
    const status = STATUS_MAP[code] ?? "M";
    const first = (match[3] ?? "").trim();
    const second = match[4]?.trim();
    if (status === "R" || status === "C") {
      const path = second || first;
      files.set(path, {
        path,
        fromPath: first,
        status,
        additions: 0,
        deletions: 0,
      });
    } else {
      files.set(first, {
        path: first,
        status,
        additions: 0,
        deletions: 0,
      });
    }
  }
  return files;
}

export function applyNumstat(
  files: Map<string, StagedFile>,
  output: string,
): void {
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;
    const pathToken = match[3] ?? "";
    let path = pathToken;
    let fromPath: string | undefined;
    const rename = pathToken.match(/^(.+) => (.+)$/);
    if (rename) {
      fromPath = stripRenameBrace(rename[1] ?? "");
      path = stripRenameBrace(rename[2] ?? "");
    }
    const existing = files.get(path) ?? {
      path,
      fromPath,
      status: (fromPath ? "R" : "M") as FileStatus,
      additions: 0,
      deletions: 0,
    };
    existing.additions = match[1] === "-" ? 0 : Number(match[1]);
    existing.deletions = match[2] === "-" ? 0 : Number(match[2]);
    if (fromPath && !existing.fromPath) existing.fromPath = fromPath;
    files.set(path, existing);
  }
}

function stripRenameBrace(value: string): string {
  return value.replace(/^\{/, "").replace(/\}$/, "");
}

export function parseUnifiedDiff(raw: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentPath: string | undefined;
  let current: DiffHunk | undefined;

  for (const line of raw.split("\n")) {
    const gitHeader = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (gitHeader) {
      currentPath = gitHeader[2];
      current = undefined;
      continue;
    }
    const plusPath = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusPath && plusPath[1] !== "/dev/null") {
      currentPath = plusPath[1];
      continue;
    }
    if (line.startsWith("@@")) {
      if (!currentPath) continue;
      current = { path: currentPath, header: line, lines: [] };
      hunks.push(current);
      continue;
    }
    if (current && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      current.lines.push(line);
    }
  }

  return hunks;
}

export function assembleDiff(
  nameStatus: string,
  numstat: string,
  raw: string,
): StagedDiff {
  const files = parseNameStatus(nameStatus);
  applyNumstat(files, numstat);
  return {
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    hunks: parseUnifiedDiff(raw),
    raw,
  };
}
