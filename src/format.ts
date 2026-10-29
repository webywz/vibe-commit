import {
  COMMIT_TYPES,
  type CommitType,
  type Engine,
  type ProposedMessage,
} from "./types.ts";

const TYPE_PATTERN = COMMIT_TYPES.join("|");
const HEADER_RE = new RegExp(
  `^(${TYPE_PATTERN})(?:\\(([a-zA-Z0-9][\\w./-]{0,62})\\))?(!)?:\\s*(.+)$`,
);

export function formatCommit(message: ProposedMessage): string {
  const bang = message.breaking ? "!" : "";
  const head = message.scope
    ? `${message.type}(${message.scope})${bang}: ${normalizeSubject(message.subject)}`
    : `${message.type}${bang}: ${normalizeSubject(message.subject)}`;
  const body = message.body?.trim();
  return body ? `${head}\n\n${body}` : head;
}

export function normalizeSubject(subject: string): string {
  let text = subject.replace(/\s+/g, " ").trim();
  text = text.replace(/^[`'"]+|[`'"]+$/g, "");
  text = text.replace(/\.+$/, "");
  if (!text) return "update project files";
  if (/^[A-Z][a-z]/.test(text) && !/^[A-Z]{2,}/.test(text)) {
    text = text.charAt(0).toLowerCase() + text.slice(1);
  }
  return clip(text, 72);
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max - 1);
  const atWord = sliced.lastIndexOf(" ");
  const base = atWord >= 40 ? sliced.slice(0, atWord) : sliced;
  return `${base.replace(/[ ,;:.-]+$/, "")}…`;
}

export function parseCommit(
  text: string,
  engine: Engine = "heuristic",
): ProposedMessage | null {
  const cleaned = stripFences(text).trim();
  if (!cleaned) return null;
  const lines = cleaned.split(/\r?\n/);
  const headerLine = lines.find((line) => HEADER_RE.test(line.trim()));
  if (!headerLine) return null;
  const match = headerLine.trim().match(HEADER_RE);
  if (!match) return null;
  const type = match[1] as CommitType;
  const scope = match[2];
  const breaking = Boolean(match[3]);
  const subject = normalizeSubject(match[4] ?? "");
  const headerIndex = lines.findIndex((line) => line.trim() === headerLine.trim());
  const rest = lines
    .slice(headerIndex + 1)
    .join("\n")
    .trim();
  return {
    type,
    scope,
    subject,
    body: rest || undefined,
    breaking,
    engine,
  };
}

export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:\w+)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .replace(/^\s*(?:commit message|message)\s*:\s*/i, "")
    .trim();
}

export function splitHeadline(formatted: string): {
  headline: string;
  body?: string;
} {
  const [headline = formatted, ...rest] = formatted.split("\n");
  const body = rest.join("\n").trim();
  return { headline, body: body || undefined };
}
