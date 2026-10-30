import { normalizeSubject } from "./format.ts";
import type {
  CommitType,
  DiffHunk,
  ProposedMessage,
  StagedDiff,
  StagedFile,
  Vibe,
} from "./types.ts";
import { applyVibe } from "./vibe.ts";

const SKIP_SCOPE_DIRS = new Set([
  ".",
  "src",
  "lib",
  "app",
  "apps",
  "dist",
  "build",
  "source",
  "sources",
  "packages",
  "test",
  "tests",
  "__tests__",
  "bin",
  "scripts",
]);

const IDENT_RE =
  /^\+\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub(?:lic|\(crate\))?\s+)?(?:function|const|let|class|type|interface|enum|fn|struct|trait|impl|def|func)\s+([A-Za-z_][\w]*)/;

const FIX_WORD_RE =
  /\b(fix|fixed|fixes|bug|bugs|hotfix|crash|broken|error|regression|issue|#\d+)\b/i;
const FEAT_WORD_RE =
  /\b(add|added|feat|feature|implement|introduce|support|enable)\b/i;
const REFACTOR_WORD_RE =
  /\b(refactor|rename|move|extract|simplify|cleanup|clean up|restructure)\b/i;
const PERF_WORD_RE =
  /\b(perf|performance|optimiz|cache|faster|speed)\b/i;

export interface HeuristicInput {
  diff: StagedDiff;
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  /** Force breaking: true (ORs with inferBreaking). */
  breaking?: boolean;
}

export function proposeHeuristic(input: HeuristicInput): ProposedMessage {
  const { diff, vibe } = input;
  const type = input.type ?? inferType(diff);
  const scope = input.scope ?? inferScope(diff.files);
  const subject = inferSubject(diff, type, scope);
  const body = inferBody(diff, type);
  const forced = Boolean(input.breaking);
  const kind = detectBreakingKind(diff, forced);
  const breaking = Boolean(kind);
  const styled = applyVibe({ type, scope, subject, body, breaking }, vibe);
  const message: ProposedMessage = {
    ...styled,
    engine: "heuristic",
    breakingReason: kind ? formatBreakingReason(kind) : undefined,
  };
  return ensureBreakingFooter(message, breakingFooterDetail(diff));
}

export function inferType(diff: StagedDiff): CommitType {
  const files = diff.files;
  if (files.length === 0) return "chore";

  const roles = files.map((file) => primaryRole(file.path));
  const unique = new Set(roles);
  const keyword = keywordType(diff);

  if (unique.size === 1) {
    const role = roles[0] ?? "chore";
    if (role !== "feat") return role;
    if (files.every((file) => file.status === "R")) return "refactor";
    return keyword ?? "feat";
  }

  if (keyword === "fix" || keyword === "perf" || keyword === "refactor") {
    return keyword;
  }

  const codeRoles = roles.filter(
    (role) => role === "feat" || role === "style" || role === "build",
  );
  if (codeRoles.length > 0) return "feat";
  if (roles.includes("test")) return "test";
  if (roles.includes("ci")) return "ci";
  if (roles.includes("docs")) return "docs";
  return "chore";
}

export function primaryRole(path: string): CommitType {
  if (isTestPath(path)) return "test";
  if (isCiPath(path)) return "ci";
  if (isDocsPath(path)) return "docs";
  if (isBuildPath(path)) return "build";
  if (isChorePath(path)) return "chore";
  if (isStylePath(path)) return "style";
  return "feat";
}

export function classifyPath(path: string): CommitType[] {
  return [primaryRole(path)];
}

function isTestPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|spec)\//i.test(path) ||
    /\.(tests?|spec)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function isCiPath(path: string): boolean {
  return /(^|\/)(\.github\/workflows|\.gitlab-ci|\.circleci)(\/|$)/i.test(path);
}

function isDocsPath(path: string): boolean {
  return (
    /(^|\/)(docs?|documentation)\//i.test(path) ||
    /\.(md|mdx|rst|adoc)$/i.test(path) ||
    /readme/i.test(path)
  );
}

function isBuildPath(path: string): boolean {
  return /(^|\/)(Dockerfile|Makefile|webpack\.|vite\.config|rollup\.config|tsup\.config|esbuild)/i.test(
    path,
  );
}

function isChorePath(path: string): boolean {
  return /(^|\/)(\.gitignore|\.editorconfig|\.nvmrc|eslint|prettier|tsconfig|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)(\b|$)/i.test(
    path,
  );
}

function isStylePath(path: string): boolean {
  return /\.(css|scss|sass|less)$/i.test(path);
}

function keywordType(diff: StagedDiff): CommitType | undefined {
  const blob = keywordCorpus(diff);
  if (FIX_WORD_RE.test(blob)) return "fix";
  if (PERF_WORD_RE.test(blob)) return "perf";
  if (REFACTOR_WORD_RE.test(blob)) return "refactor";
  if (FEAT_WORD_RE.test(blob)) return "feat";
  return undefined;
}

export function inferScope(files: StagedFile[]): string | undefined {
  if (files.length === 0) return undefined;
  const candidates = files
    .map((file) => scopeFromPath(file.path))
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return undefined;
  const [name, count] = top;
  if (count / files.length < 0.5 && files.length > 2) return undefined;
  if (SKIP_SCOPE_DIRS.has(name)) return undefined;
  return name.slice(0, 32);
}

export function inferSubject(
  diff: StagedDiff,
  type: CommitType,
  scope?: string,
): string {
  const files = diff.files;
  if (files.length === 0) return "update project files";

  const added = files.filter((file) => file.status === "A");
  const deleted = files.filter((file) => file.status === "D");
  const renamed = files.filter((file) => file.status === "R");
  const idents =
    files.length <= 3 ? collectAddedIdentifiers(diff.hunks).slice(0, 2) : [];

  if (
    added.length >= 4 &&
    added.length >= files.length - 1 &&
    !scope &&
    type === "feat"
  ) {
    return normalizeSubject("add initial implementation");
  }

  if (renamed.length === 1 && files.length === 1) {
    const file = renamed[0]!;
    return normalizeSubject(
      `rename ${stem(file.fromPath ?? file.path)} to ${stem(file.path)}`,
    );
  }
  if (deleted.length === files.length) {
    return normalizeSubject(
      `remove ${joinNames(deleted.map((file) => stem(file.path)))}`,
    );
  }
  if (idents.length > 0 && (type === "feat" || type === "fix")) {
    const verb = type === "fix" ? "fix" : "add";
    return normalizeSubject(`${verb} ${joinNames(idents.map(humanizeIdent))}`);
  }
  if (added.length === 1 && files.length === 1) {
    return normalizeSubject(`add ${stem(added[0]!.path)}`);
  }
  if (added.length > 1 && added.length === files.length) {
    return normalizeSubject(`add ${summarizeFiles(added, scope)}`);
  }

  const focus =
    files.length === 1 ? stem(files[0]!.path) : summarizeFiles(files, scope);
  return normalizeSubject(verbFor(type, focus, files));
}

function verbFor(
  type: CommitType,
  focus: string,
  files: StagedFile[],
): string {
  const mostlyAdd =
    files.reduce((sum, file) => sum + file.additions, 0) >
    files.reduce((sum, file) => sum + file.deletions, 0) * 1.4;
  switch (type) {
    case "feat":
      return mostlyAdd ? `add ${focus}` : `update ${focus}`;
    case "fix":
      return `fix ${focus}`;
    case "docs":
      return files.some((file) => /readme/i.test(file.path))
        ? "update readme"
        : `update ${focus}`;
    case "test":
      return mostlyAdd ? `add ${focus} tests` : `update ${focus} tests`;
    case "refactor":
      return `refactor ${focus}`;
    case "perf":
      return `improve ${focus} performance`;
    case "style":
      return `format ${focus}`;
    case "ci":
      return `update ${focus} workflow`;
    case "build":
      return `update ${focus} build`;
    case "chore":
      if (
        files.some((file) =>
          /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(file.path),
        )
      ) {
        return "update dependencies";
      }
      return `update ${focus}`;
  }
}

function inferBody(diff: StagedDiff, type: CommitType): string | undefined {
  const files = diff.files;
  if (files.length < 3) return undefined;
  const listed = files
    .slice(0, 8)
    .map((file) => `- ${statusLabel(file.status)} ${file.path}`)
    .join("\n");
  const extra = files.length > 8 ? `\n- …and ${files.length - 8} more` : "";
  const lead =
    type === "feat"
      ? "Touches:"
      : type === "fix"
        ? "Files in this fix:"
        : "Changed files:";
  return `${lead}\n${listed}${extra}`;
}

export type BreakingKind =
  | "export-removed"
  | "major-bump"
  | "footer"
  | "forced";

export function inferBreaking(diff: StagedDiff): boolean {
  return Boolean(detectBreakingKind(diff, false));
}

/** Why breaking was set — heuristic signal first, then --breaking. */
export function detectBreakingKind(
  diff: StagedDiff,
  forced = false,
): BreakingKind | undefined {
  if (detectBreakingFooter(diff)) return "footer";
  if (detectRemovedExports(diff).length > 0) return "export-removed";
  if (detectMajorVersionBump(diff)) return "major-bump";
  if (forced) return "forced";
  return undefined;
}

/** One-line bilingual cause for dry-run / --json.breakingReason. */
export function formatBreakingReason(kind: BreakingKind): string {
  switch (kind) {
    case "export-removed":
      return "export removed · 公开 export 删除";
    case "major-bump":
      return "major bump · package.json 主版本升级";
    case "footer":
      return "BREAKING CHANGE footer in diff · 变更中含 BREAKING CHANGE 页脚";
    case "forced":
      return "forced via --breaking · --breaking 强制";
  }
}

/** Detail text for the BREAKING CHANGE footer, or undefined when not inferred. */
export function breakingFooterDetail(diff: StagedDiff): string | undefined {
  const footer = detectBreakingFooter(diff);
  if (footer) return footer;

  const removed = detectRemovedExports(diff);
  if (removed.length > 0) {
    const names = removed.slice(0, 3).join(", ");
    return removed.length === 1
      ? `remove public export ${names}`
      : `remove public exports ${names}`;
  }

  const bump = detectMajorVersionBump(diff);
  if (bump) return `bump major version to ${bump.to}`;

  return undefined;
}


/**
 * Ensure body carries a conventional BREAKING CHANGE footer when breaking.
 * Skips if the body already mentions one. Uses subject as a last-resort reason.
 */
export function ensureBreakingFooter(
  message: ProposedMessage,
  reason?: string,
): ProposedMessage {
  if (!message.breaking) return message;
  const body = message.body?.trim() ?? "";
  if (/BREAKING CHANGE:/i.test(body)) {
    return body === (message.body ?? "") ? message : { ...message, body };
  }
  const detail = (reason ?? message.subject).replace(/\s+/g, " ").trim() ||
    "incompatible API change";
  const footer = `BREAKING CHANGE: ${detail}`;
  return {
    ...message,
    body: body ? `${body}\n\n${footer}` : footer,
  };
}

function detectBreakingFooter(diff: StagedDiff): string | undefined {
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      const match = line.match(/^\+\s*BREAKING CHANGE:\s*(.+)$/i);
      if (match?.[1]) return match[1].trim();
    }
  }
  // Presence of the token alone still counts as breaking.
  if (
    diff.hunks.some((hunk) =>
      hunk.lines.some((line) => /^\+\s*BREAKING CHANGE:/i.test(line)),
    )
  ) {
    return "incompatible API change";
  }
  return undefined;
}

const DELETED_EXPORT_RE =
  /^-\s*export(?:\s+default\b|\s*\{|\s+)/;

function detectRemovedExports(diff: StagedDiff): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("---")) continue;
      if (!DELETED_EXPORT_RE.test(line)) continue;
      const name = exportNameFromDeletedLine(line);
      const key = name ?? line.slice(1).trim();
      if (seen.has(key)) continue;
      seen.add(key);
      if (name) names.push(name);
      else names.push("export");
    }
  }
  return names;
}

function exportNameFromDeletedLine(line: string): string | undefined {
  const content = line.slice(1);
  const named = content.match(
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_][\w]*)/,
  );
  if (named?.[1]) return named[1];
  const braced = content.match(/export\s*\{\s*([^}]+)\s*\}/);
  if (braced?.[1]) {
    const first = braced[1].split(",")[0]?.trim().split(/\s+as\s+/i)[0]?.trim();
    if (first && /^[A-Za-z_][\w]*$/.test(first)) return first;
  }
  const def = content.match(/export\s+default\s+([A-Za-z_][\w]*)/);
  if (def?.[1]) return def[1];
  return undefined;
}

interface VersionPair {
  from: string;
  to: string;
}

function detectMajorVersionBump(diff: StagedDiff): VersionPair | undefined {
  for (const hunk of diff.hunks) {
    if (!/(^|\/)package\.json$/i.test(hunk.path)) continue;
    const removed: string[] = [];
    const added: string[] = [];
    for (const line of hunk.lines) {
      const rem = line.match(/^-\s*"version"\s*:\s*"([^"]+)"/);
      const add = line.match(/^\+\s*"version"\s*:\s*"([^"]+)"/);
      if (rem?.[1]) removed.push(rem[1]);
      if (add?.[1]) added.push(add[1]);
    }
    for (const from of removed) {
      for (const to of added) {
        if (isMajorBump(from, to)) return { from, to };
      }
    }
  }
  return undefined;
}

function isMajorBump(from: string, to: string): boolean {
  const a = parseSemverMajor(from);
  const b = parseSemverMajor(to);
  if (a === undefined || b === undefined) return false;
  return b > a;
}

function parseSemverMajor(version: string): number | undefined {
  const match = version.trim().match(/^v?(\d+)\./);
  if (!match) return undefined;
  return Number(match[1]);
}


export function collectAddedIdentifiers(hunks: DiffHunk[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      const match = line.match(IDENT_RE);
      if (!match?.[1]) continue;
      const name = match[1];
      if (seen.has(name) || name.length < 2) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function scopeFromPath(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts[0] === "packages" && parts[1]) return sanitizeIdent(parts[1]);
  const start = SKIP_SCOPE_DIRS.has(parts[0] ?? "") ? 1 : 0;
  const candidate = parts[start];
  if (!candidate) return undefined;
  if (parts.length < start + 2) {
    if (
      parts.length === start + 1 &&
      !candidate.startsWith(".") &&
      !isDocsPath(path) &&
      !isChorePath(path) &&
      !isCiPath(path)
    ) {
      const name = sanitizeIdent(candidate.replace(/\.[^.]+$/, ""));
      if (name && name !== "index") return name;
    }
    return undefined;
  }
  if (SKIP_SCOPE_DIRS.has(candidate) || candidate.startsWith(".")) {
    return undefined;
  }
  return sanitizeIdent(candidate.replace(/\.[^.]+$/, ""));
}

function sanitizeIdent(value: string): string {
  return value
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function stem(path: string): string {
  const parts = path.split("/").filter(Boolean);
  let base = parts.at(-1) ?? path;
  if (/^(index|main|mod|__init__)\.[^.]+$/i.test(base) && parts.length >= 2) {
    base = parts.at(-2) ?? base;
  }
  base = base.replace(/\.(tests?|spec)\.[^.]+$/i, "");
  base = base.replace(/\.[^.]+$/, "");
  return humanizeIdent(base);
}

function humanizeIdent(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function joinNames(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return "files";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]}, and more`;
}

function summarizeFiles(files: StagedFile[], scope?: string): string {
  if (scope) return scope;
  return joinNames(files.map((file) => stem(file.path)).slice(0, 2));
}

function statusLabel(status: StagedFile["status"]): string {
  switch (status) {
    case "A":
      return "add";
    case "D":
      return "delete";
    case "R":
      return "rename";
    default:
      return "edit";
  }
}

function keywordCorpus(diff: StagedDiff): string {
  const paths = diff.files.map((file) => file.path).join("\n");
  const onlyDocs = diff.files.every((file) => isDocsPath(file.path));
  const docPaths = new Set(
    diff.files.filter((file) => isDocsPath(file.path)).map((file) => file.path),
  );
  const lines: string[] = [];
  for (const hunk of diff.hunks) {
    const fromDocs = onlyDocs && docPaths.has(hunk.path);
    for (const line of hunk.lines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (fromDocs || /^\+\s*(?:\/\/|#|\/\*|\*|<!--)/.test(line)) {
        lines.push(line);
      }
    }
  }
  return `${paths}\n${lines.join("\n")}`;
}
