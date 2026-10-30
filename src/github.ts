import { appendFileSync } from "node:fs";
import { formatCommit } from "./format.ts";
import type { CommitType, ProposedMessage, StagedDiff } from "./types.ts";

export interface GitHubFormatOptions {
  /** Soft cap for PR annotation noise. Default 20. */
  maxAnnotations?: number;
}

type AnnotationType = "error" | "warning" | "notice";

/** Escape payload text for workflow command messages. */
export function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape workflow command property values (file, title, …). */
export function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function annotation(
  type: AnnotationType,
  message: string,
  props: { file?: string; line?: number; title?: string } = {},
): string {
  const parts: string[] = [];
  if (props.file) parts.push(`file=${escapeProperty(props.file)}`);
  if (props.line !== undefined && Number.isFinite(props.line)) {
    parts.push(`line=${Math.max(1, Math.trunc(props.line))}`);
  }
  if (props.title) parts.push(`title=${escapeProperty(props.title)}`);
  const meta = parts.length > 0 ? ` ${parts.join(",")}` : "";
  return `::${type}${meta}::${escapeData(message)}`;
}

/** Heuristic risk tier → annotation level (breaking / fix weigh heavier). */
export function proposalAnnotationType(
  proposal: ProposedMessage,
): AnnotationType {
  if (proposal.breaking) return "error";
  switch (proposal.type as CommitType) {
    case "fix":
      return "warning";
    case "feat":
    case "perf":
    case "refactor":
      return "notice";
    default:
      return "notice";
  }
}

function oneLine(value: string, max = 200): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function headerLine(proposal: ProposedMessage): string {
  return formatCommit({ ...proposal, body: undefined }).split("\n")[0] ?? "";
}

/**
 * Emit GitHub Actions workflow commands so PR Checks show the proposed commit.
 * Offline / local-safe: pure string formatting, no network.
 */
export function formatGitHubAnnotations(
  proposal: ProposedMessage,
  diff: StagedDiff,
  options: GitHubFormatOptions = {},
): string {
  const max = options.maxAnnotations ?? 20;
  const lines: string[] = [];
  const push = (line: string): void => {
    if (lines.length < max) lines.push(line);
  };

  const primary = diff.files[0]?.path;
  const title = headerLine(proposal);

  push(
    annotation(proposalAnnotationType(proposal), title, {
      file: primary,
      title: "vibe-commit · title",
    }),
  );

  if (proposal.breaking) {
    const reason =
      proposal.breakingReason?.trim() ||
      "Breaking change detected in staged diff.";
    push(
      annotation("error", oneLine(reason), {
        file: primary,
        title: "vibe-commit · breaking",
      }),
    );
  }

  if (proposal.body?.trim()) {
    push(
      annotation("notice", oneLine(proposal.body), {
        file: primary,
        title: "vibe-commit · body",
      }),
    );
  }

  for (const file of diff.files) {
    const status =
      file.status === "A"
        ? "add"
        : file.status === "D"
          ? "delete"
          : file.status === "R"
            ? "rename"
            : "update";
    push(
      annotation(
        "notice",
        `${status} \`${file.path}\` (+${file.additions} −${file.deletions})`,
        {
          file: file.path,
          title: "vibe-commit · file",
        },
      ),
    );
  }

  const totals = diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );

  push(
    annotation(
      "notice",
      `${diff.files.length} files · +${totals.add} / −${totals.del} · engine ${proposal.engine}`,
      { title: "vibe-commit · meta" },
    ),
  );

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Append job outputs when running inside Actions (`GITHUB_OUTPUT`). */
export function appendGitHubJobOutput(
  proposal: ProposedMessage,
  diff: StagedDiff,
): void {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const body = [
    `title=${oneLine(headerLine(proposal), 256)}`,
    `subject=${oneLine(proposal.subject, 200)}`,
    `type=${proposal.type}`,
    `scope=${proposal.scope ?? ""}`,
    `breaking=${proposal.breaking}`,
    `engine=${proposal.engine}`,
    `findings=${diff.files.length}`,
  ].join("\n");
  appendFileSync(path, `${body}\n`, "utf8");
}

/** Build a short Markdown Job Summary for Actions (no env I/O). */
export function formatGitHubStepSummary(
  proposal: ProposedMessage,
  diff: StagedDiff,
): string {
  const totals = diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
  const lines: string[] = [
    "## vibe-commit",
    "",
    `| | |`,
    `| --- | --- |`,
    `| **Title** | ${headerLine(proposal)} |`,
    `| **Type** | \`${proposal.type}\`${proposal.scope ? ` (\`${proposal.scope}\`)` : ""} |`,
    `| **Breaking** | ${proposal.breaking} |`,
    `| **Engine** | ${proposal.engine} |`,
    `| **Files** | ${diff.files.length} (+${totals.add} / −${totals.del}) staged |`,
    "",
  ];

  if (proposal.breakingReason?.trim()) {
    lines.push(`**Breaking:** _${oneLine(proposal.breakingReason, 280)}_`, "");
  } else if (proposal.body?.trim()) {
    lines.push(`_${oneLine(proposal.body, 280)}_`, "");
  }

  const findings: string[] = [];
  for (const file of diff.files.slice(0, 8)) {
    findings.push(
      `- \`${file.path}\` (${file.status}, +${file.additions} −${file.deletions})`,
    );
  }
  if (findings.length > 0) {
    lines.push("### Staged files", "", ...findings, "");
  } else {
    lines.push("_No staged files._", "");
  }
  return lines.join("\n");
}

/**
 * Append a concise Job Summary when running inside Actions (`GITHUB_STEP_SUMMARY`).
 * No-op when the env var is unset.
 */
export function appendGitHubStepSummary(
  proposal: ProposedMessage,
  diff: StagedDiff,
): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${formatGitHubStepSummary(proposal, diff)}\n`, "utf8");
}
