import pc from "picocolors";
import { formatCommit } from "./format.ts";
import type { ProposedMessage, StagedDiff } from "./types.ts";

export function renderProposal(
  diff: StagedDiff,
  message: ProposedMessage,
  hints: { committed?: boolean; piped?: boolean } = {},
): string {
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
    return `    ${pc.dim(file.status)}  ${file.path}  ${pc.dim(stats)}`;
  });
  if (diff.files.length > 10) {
    fileLines.push(pc.dim(`    … ${diff.files.length - 10} more`));
  }

  const lines = [
    "",
    `  ${pc.bold("vibe-commit")}  ${pc.dim("·")}  ${pc.cyan(engine)}  ${pc.dim("·")}  ${message.type}`,
    "",
    `  ${pc.bold(String(diff.files.length))} ${fileLabel}  ${pc.dim("·")}  ${pc.green(`+${totals.add}`)}  ${pc.red(`−${totals.del}`)}`,
    "",
    ...fileLines,
    "",
    `  ${pc.dim("proposed")}`,
    "",
    ...indent(formatted, pc),
    "",
  ];

  if (hints.committed) {
    lines.push(`  ${pc.green("committed")}`);
    lines.push("");
  } else {
    lines.push(`  ${pc.dim("next")}  vibe-commit --commit`);
    lines.push("");
  }

  return lines.join("\n");
}

function indent(
  formatted: string,
  colors: typeof pc,
): string[] {
  return formatted.split("\n").map((line, index) => {
    if (!line) return "";
    if (index === 0) return `    ${colors.bold(line)}`;
    return `    ${colors.dim(line)}`;
  });
}

export function renderError(message: string): string {
  return `${pc.red("vibe-commit")}  ${message}`;
}

export function renderVersion(version: string): string {
  return `vibe-commit ${version}`;
}
