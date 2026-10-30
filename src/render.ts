import pc from "picocolors";
import { formatCommit } from "./format.ts";
import type { ProposedMessage, StagedDiff } from "./types.ts";

export function renderProposal(
  diff: StagedDiff,
  message: ProposedMessage,
  hints: { committed?: boolean; piped?: boolean; noColor?: boolean } = {},
): string {
  const colors = hints.noColor ? pc.createColors(false) : pc;
  const formatted = formatCommit(message);
  if (hints.piped) return formatted;

  const totals = diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
  const fileLabel = diff.files.length === 1 ? "file" : "files";
  const engine =
    message.engine === "ai" ? "openai" : "heuristic";
  const fileLines = diff.files.slice(0, 10).map((file) => {
    const stats = `+${file.additions} −${file.deletions}`;
    return `    ${colors.dim(file.status)}  ${file.path}  ${colors.dim(stats)}`;
  });
  if (diff.files.length > 10) {
    fileLines.push(colors.dim(`    … ${diff.files.length - 10} more`));
  }

  const lines = [
    "",
    `  ${colors.bold("vibe-commit")}  ${colors.dim("·")}  ${colors.cyan(engine)}  ${colors.dim("·")}  ${message.type}`,
    "",
    `  ${colors.bold(String(diff.files.length))} ${fileLabel}  ${colors.dim("·")}  ${colors.green(`+${totals.add}`)}  ${colors.red(`−${totals.del}`)}`,
    "",
    ...fileLines,
    "",
    `  ${colors.dim("proposed")}`,
    "",
    ...indent(formatted, colors),
    "",
  ];

  if (message.breaking && message.breakingReason) {
    lines.push(
      `  ${colors.yellow("breaking")}  ${colors.dim(message.breakingReason)}`,
    );
    lines.push("");
  }

  if (hints.committed) {
    lines.push(`  ${colors.green("committed")}`);
    lines.push("");
  } else {
    lines.push(`  ${colors.dim("next")}  vibe-commit --commit`);
    lines.push("");
  }

  return lines.join("\n");
}

function indent(
  formatted: string,
  colors: ReturnType<typeof pc.createColors>,
): string[] {
  return formatted.split("\n").map((line, index) => {
    if (!line) return "";
    if (index === 0) return `    ${colors.bold(line)}`;
    return `    ${colors.dim(line)}`;
  });
}

export function renderError(message: string, noColor = false): string {
  const colors = noColor ? pc.createColors(false) : pc;
  return `${colors.red("vibe-commit")}  ${message}`;
}

export function renderVersion(version: string, noColor = false): string {
  return `vibe-commit ${version}`;
}
