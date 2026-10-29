export const VIBES = ["playful", "pro", "terse"] as const;
export type Vibe = (typeof VIBES)[number];

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

export type FileStatus = "A" | "M" | "D" | "R" | "C" | "T" | "U";

export interface StagedFile {
  path: string;
  fromPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  path: string;
  header: string;
  lines: string[];
}

export interface StagedDiff {
  files: StagedFile[];
  hunks: DiffHunk[];
  raw: string;
}

export type Engine = "heuristic" | "ai";

export interface ProposedMessage {
  type: CommitType;
  scope?: string;
  subject: string;
  body?: string;
  breaking: boolean;
  engine: Engine;
}

export interface ProposeOptions {
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  preferAi?: boolean;
}

export interface CliOptions {
  commit: boolean;
  dryRun: boolean;
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  noAi: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}
