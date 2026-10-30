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
  /** Short cause when breaking (export removed / major bump / --breaking / footer). */
  breakingReason?: string;
  engine: Engine;
}

export interface ProposeOptions {
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  preferAi?: boolean;
  /** Force a breaking change (! + BREAKING CHANGE footer). */
  breaking?: boolean;
}

export type CliCommand =
  | "propose"
  | "install"
  | "uninstall"
  | "prepare-commit-msg";

export interface CliOptions {
  command: CliCommand;
  commit: boolean;
  dryRun: boolean;
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  noAi: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
  /** Force breaking change marker and footer. */
  breaking: boolean;
  /** Target repo for install/uninstall (default: cwd). */
  path?: string;
  /** Message file path for prepare-commit-msg. */
  messageFile?: string;
  /** Git prepare-commit-msg source (message|template|merge|squash|commit). */
  commitSource?: string;
}
