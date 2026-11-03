import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommit } from "./format.ts";
import { assertRepo, GitError, inspectStaged } from "./git.ts";
import { proposeMessage } from "./propose.ts";
import { resolveLocale, resolveVibe } from "./config.ts";

export const HOOK_BEGIN = "# BEGIN VIBE-COMMIT";
export const HOOK_END = "# END VIBE-COMMIT";
export const HOOK_NAME = "prepare-commit-msg";
export const HOOK_BACKUP_NAME = "prepare-commit-msg.vibe-backup";

const SKIP_SOURCES = new Set(["merge", "squash", "commit"]);

export type HookManager = "husky" | "simple-git-hooks" | "bare";

export interface InitResult {
  manager: HookManager;
  targetPath: string;
  created: boolean;
  updated: boolean;
  backedUp: boolean;
}

export function hasNonCommentContent(content: string): boolean {
  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#");
  });
}

/** Skip merge/squash/amend, or when the message file already has user text. */
export function shouldSkipPrepareCommitMsg(
  messageFileContent: string,
  source?: string,
): boolean {
  const src = (source ?? "").trim().toLowerCase();
  if (SKIP_SOURCES.has(src)) return true;
  return hasNonCommentContent(messageFileContent);
}

/**
 * prepare-commit-msg runner. Offline by default (set VIBE_COMMIT_HOOK_AI=1 to enable AI).
 * Never throws into git — failures are swallowed as "noop".
 */
export async function runPrepareCommitMsg(
  messageFile: string,
  source?: string,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<"wrote" | "skipped" | "noop"> {
  let content = "";
  try {
    content = readFileSync(messageFile, "utf8");
  } catch {
    return "noop";
  }

  if (shouldSkipPrepareCommitMsg(content, source)) return "skipped";

  try {
    const diff = inspectStaged(cwd);
    // Avoid hanging `git commit` on network — hooks stay offline unless opted in.
    const useAi = env.VIBE_COMMIT_HOOK_AI === "1";
    const message = await proposeMessage(
      diff,
      {
        vibe: resolveVibe(env, cwd),
        locale: resolveLocale(env, cwd),
        preferAi: useAi,
      },
      env,
    );
    const formatted = formatCommit(message);
    const comments = content
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("#"))
      .join("\n");
    const next = comments
      ? `${formatted}\n\n${comments}\n`
      : `${formatted}\n`;
    writeFileSync(messageFile, next, "utf8");
    return "wrote";
  } catch {
    return "noop";
  }
}

export interface HookPaths {
  repoPath: string;
  hooksDir: string;
  hookPath: string;
  backupPath: string;
}

export function resolveHookPaths(repoPath = process.cwd()): HookPaths {
  assertRepo(repoPath);
  const hooksDir = resolveGitHooksDir(repoPath);
  return {
    repoPath,
    hooksDir,
    hookPath: join(hooksDir, HOOK_NAME),
    backupPath: join(hooksDir, HOOK_BACKUP_NAME),
  };
}

export function resolveGitHooksDir(repoPath: string): string {
  try {
    const hooksPath = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return isAbsolute(hooksPath) ? hooksPath : join(repoPath, hooksPath);
  } catch {
    throw new GitError("Could not resolve .git/hooks for this repository.");
  }
}

export function resolveInstallCommand(
  argv1 = process.argv[1],
  execPath = process.execPath,
): { execPath: string; cliPath: string } {
  let cliPath: string | undefined;
  if (argv1 && existsSync(argv1)) {
    cliPath = argv1;
  } else {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["cli.js", "cli.ts"]) {
      const candidate = join(here, name);
      if (existsSync(candidate)) {
        cliPath = candidate;
        break;
      }
    }
  }
  if (!cliPath) {
    throw new GitError(
      "Could not locate the vibe-commit CLI entry. Reinstall @webywz/vibe-commit and retry.",
    );
  }
  // Source installs (tsx) need the tsx binary; published dist uses node + cli.js.
  if (cliPath.endsWith(".ts")) {
    const tsx = findTsxBinary(cliPath);
    if (tsx) return { execPath: tsx, cliPath };
  }
  return { execPath, cliPath };
}

function findTsxBinary(cliPath: string): string | undefined {
  let dir = dirname(cliPath);
  for (let i = 0; i < 6; i += 1) {
    const bin = join(dir, "node_modules", ".bin", "tsx");
    if (existsSync(bin)) return bin;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function buildManagedHookBlock(
  execPath: string,
  cliPath: string,
): string {
  const node = shellQuote(execPath);
  const cli = shellQuote(cliPath);
  return [
    HOOK_BEGIN,
    "# Managed by @webywz/vibe-commit — do not edit this block",
    `${node} ${cli} prepare-commit-msg "$1" "$2" || true`,
    HOOK_END,
  ].join("\n");
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function replaceManagedBlock(source: string, block: string): string {
  const begin = source.indexOf(HOOK_BEGIN);
  const end = source.indexOf(HOOK_END);
  if (begin === -1 || end === -1 || end < begin) {
    return `${source.trimEnd()}\n\n${block}\n`;
  }
  const afterEnd = end + HOOK_END.length;
  return `${source.slice(0, begin)}${block}${source.slice(afterEnd)}`;
}

export function stripManagedBlock(source: string): string {
  const begin = source.indexOf(HOOK_BEGIN);
  const end = source.indexOf(HOOK_END);
  if (begin === -1 || end === -1 || end < begin) return source;
  const afterEnd = end + HOOK_END.length;
  const before = source.slice(0, begin).replace(/\n+$/, "\n");
  const after = source.slice(afterEnd).replace(/^\n+/, "\n");
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trimStart();
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function isShebangOnly(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed === "" ||
    trimmed === "#!/bin/sh" ||
    trimmed === "#!/usr/bin/env bash" ||
    trimmed === "#!/bin/bash"
  );
}

/**
 * Detect which hook manager the repo uses.
 * Order: husky → simple-git-hooks → bare .git/hooks
 */
export function detectHookManager(repoPath: string): HookManager {
  assertRepo(repoPath);

  // 1. Husky: check for .husky/ directory or "husky" in package.json
  const huskyDir = join(repoPath, ".husky");
  if (existsSync(huskyDir)) {
    return "husky";
  }

  const pkgPath = join(repoPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
        "simple-git-hooks"?: unknown;
      };
      if (
        pkg.devDependencies?.husky ||
        pkg.dependencies?.husky
      ) {
        return "husky";
      }

      // 2. simple-git-hooks: check for package or config
      if (
        pkg.devDependencies?.["simple-git-hooks"] ||
        pkg.dependencies?.["simple-git-hooks"] ||
        pkg["simple-git-hooks"]
      ) {
        return "simple-git-hooks";
      }
    } catch {
      // Malformed package.json; fall through to bare
    }
  }

  // 3. Bare .git/hooks
  return "bare";
}

/**
 * Init: auto-detect hook manager and install accordingly.
 */
export function initHook(
  repoPath = process.cwd(),
  options: {
    force?: boolean;
    command?: { execPath: string; cliPath: string };
  } = {},
): InitResult {
  assertRepo(repoPath);
  const manager = detectHookManager(repoPath);
  const command = options.command ?? resolveInstallCommand();

  switch (manager) {
    case "husky":
      return initHusky(repoPath, command, options.force);
    case "simple-git-hooks":
      return initSimpleGitHooks(repoPath, command, options.force);
    case "bare":
      return initBare(repoPath, command, options.force);
  }
}

function foreignHookError(hookPath: string): GitError {
  return new GitError(
    `${hookPath} already exists and is not managed by vibe-commit.\n` +
      `已存在且不由 vibe-commit 管理。\n` +
      `Use --force to overwrite (backs up as ${HOOK_BACKUP_NAME}).\n` +
      `使用 --force 覆盖（会备份为 ${HOOK_BACKUP_NAME}）。`,
  );
}

function installFileHook(
  hookPath: string,
  backupPath: string,
  command: { execPath: string; cliPath: string },
  force?: boolean,
): { created: boolean; updated: boolean; backedUp: boolean } {
  mkdirSync(dirname(hookPath), { recursive: true });
  const block = buildManagedHookBlock(command.execPath, command.cliPath);
  const existing = existsSync(hookPath)
    ? readFileSync(hookPath, "utf8")
    : null;

  if (existing === null) {
    writeFileSync(hookPath, `#!/bin/sh\n${block}\n`, { mode: 0o755 });
    chmodSync(hookPath, 0o755);
    return { created: true, updated: false, backedUp: false };
  }

  if (existing.includes(HOOK_BEGIN) && existing.includes(HOOK_END)) {
    const next = replaceManagedBlock(existing, block);
    writeFileSync(hookPath, ensureTrailingNewline(next), { mode: 0o755 });
    chmodSync(hookPath, 0o755);
    return { created: false, updated: true, backedUp: false };
  }

  if (!force) {
    throw foreignHookError(hookPath);
  }

  writeFileSync(backupPath, existing, { mode: 0o755 });
  chmodSync(backupPath, 0o755);
  const wrapper = [
    "#!/bin/sh",
    block,
    "",
    "# Chain the previous prepare-commit-msg hook",
    `if [ -x ${shellQuote(backupPath)} ]; then`,
    `  ${shellQuote(backupPath)} "$@" || exit $?`,
    "fi",
    "",
  ].join("\n");
  writeFileSync(hookPath, wrapper, { mode: 0o755 });
  chmodSync(hookPath, 0o755);
  return { created: true, updated: false, backedUp: true };
}

function uninstallFileHook(
  hookPath: string,
  backupPath: string,
  force?: boolean,
): { hookPath: string; removed: boolean; restored: boolean } {
  if (!existsSync(hookPath)) {
    return { hookPath, removed: false, restored: false };
  }

  const existing = readFileSync(hookPath, "utf8");
  const hasManaged =
    existing.includes(HOOK_BEGIN) && existing.includes(HOOK_END);

  if (!hasManaged) {
    if (!force) {
      return { hookPath, removed: false, restored: false };
    }
    if (existsSync(backupPath)) {
      renameSync(backupPath, hookPath);
      chmodSync(hookPath, 0o755);
      return { hookPath, removed: true, restored: true };
    }
    unlinkSync(hookPath);
    return { hookPath, removed: true, restored: false };
  }

  if (existsSync(backupPath)) {
    renameSync(backupPath, hookPath);
    chmodSync(hookPath, 0o755);
    return { hookPath, removed: true, restored: true };
  }

  const stripped = stripManagedBlock(existing).trim();
  if (isShebangOnly(stripped)) {
    unlinkSync(hookPath);
    return { hookPath, removed: true, restored: false };
  }

  writeFileSync(hookPath, ensureTrailingNewline(stripped), {
    mode: 0o755,
  });
  return { hookPath, removed: true, restored: false };
}

function initHusky(
  repoPath: string,
  command: { execPath: string; cliPath: string },
  force?: boolean,
): InitResult {
  const huskyDir = join(repoPath, ".husky");
  mkdirSync(huskyDir, { recursive: true });
  const hookPath = join(huskyDir, HOOK_NAME);
  const backupPath = join(huskyDir, HOOK_BACKUP_NAME);
  const result = installFileHook(hookPath, backupPath, command, force);
  return { manager: "husky", targetPath: hookPath, ...result };
}

function initSimpleGitHooks(
  repoPath: string,
  command: { execPath: string; cliPath: string },
  force?: boolean,
): InitResult {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) {
    throw new GitError(
      `package.json not found at ${pkgPath}. Cannot configure simple-git-hooks.\n` +
        `找不到 package.json，无法配置 simple-git-hooks。`,
    );
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    "simple-git-hooks"?: Record<string, string>;
  };

  const hookCmd = `${shellQuote(command.execPath)} ${shellQuote(command.cliPath)} prepare-commit-msg "$1" "$2" || true`;

  if (!pkg["simple-git-hooks"]) {
    pkg["simple-git-hooks"] = {};
  }

  const existing = pkg["simple-git-hooks"][HOOK_NAME];
  const managed = existing ? isManagedSimpleGitHookCommand(existing) : false;

  if (existing && !managed && !force) {
    throw new GitError(
      `package.json already has simple-git-hooks.${HOOK_NAME}:\n` +
        `  ${existing}\n` +
        `Use --force to overwrite.\n` +
        `package.json 已有 simple-git-hooks.${HOOK_NAME} 配置。\n` +
        `使用 --force 覆盖。`,
    );
  }

  const created = !existing;
  const updated = !!existing;

  pkg["simple-git-hooks"][HOOK_NAME] = hookCmd;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  return {
    manager: "simple-git-hooks",
    targetPath: pkgPath,
    created,
    updated,
    backedUp: false,
  };
}

export function isManagedSimpleGitHookCommand(cmd: string): boolean {
  return (
    cmd.includes("prepare-commit-msg") &&
    (cmd.includes("vibe-commit") || /cli\.(js|ts)/.test(cmd))
  );
}

function initBare(
  repoPath: string,
  command: { execPath: string; cliPath: string },
  force?: boolean,
): InitResult {
  const result = installHook(repoPath, command, { force });
  return {
    manager: "bare",
    targetPath: result.hookPath,
    created: result.created,
    updated: result.updated,
    backedUp: result.backedUp,
  };
}

export function installHook(
  repoPath = process.cwd(),
  command = resolveInstallCommand(),
  options: { force?: boolean } = {},
): { hookPath: string; created: boolean; updated: boolean; backedUp: boolean } {
  const paths = resolveHookPaths(repoPath);
  const result = installFileHook(
    paths.hookPath,
    paths.backupPath,
    command,
    options.force,
  );
  return { hookPath: paths.hookPath, ...result };
}

export function uninstallHook(
  repoPath = process.cwd(),
  options: { force?: boolean } = {},
): {
  hookPath: string;
  removed: boolean;
  restored: boolean;
} {
  const paths = resolveHookPaths(repoPath);
  return uninstallFileHook(paths.hookPath, paths.backupPath, options.force);
}

export interface UninstallResult {
  manager: HookManager;
  hookPath: string;
  removed: boolean;
  restored: boolean;
}

/**
 * Uninstall using the same manager detection as `init` / `install`.
 * Without `--force`, unmanaged foreign hooks/config are left in place.
 * With `--force`, foreign file hooks are removed (restoring a backup when
 * present) and foreign simple-git-hooks entries are deleted.
 */
export function uninstallManagedHook(
  repoPath = process.cwd(),
  options: { force?: boolean } = {},
): UninstallResult {
  assertRepo(repoPath);
  const manager = detectHookManager(repoPath);
  switch (manager) {
    case "husky": {
      const huskyDir = join(repoPath, ".husky");
      const result = uninstallFileHook(
        join(huskyDir, HOOK_NAME),
        join(huskyDir, HOOK_BACKUP_NAME),
        options.force,
      );
      return { manager, ...result };
    }
    case "simple-git-hooks":
      return { manager, ...uninstallSimpleGitHooks(repoPath, options.force) };
    case "bare":
      return { manager, ...uninstallHook(repoPath, options) };
  }
}

function uninstallSimpleGitHooks(
  repoPath: string,
  force?: boolean,
): { hookPath: string; removed: boolean; restored: boolean } {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { hookPath: pkgPath, removed: false, restored: false };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    "simple-git-hooks"?: Record<string, string>;
  };
  const existing = pkg["simple-git-hooks"]?.[HOOK_NAME];
  if (!existing) {
    return { hookPath: pkgPath, removed: false, restored: false };
  }

  if (!isManagedSimpleGitHookCommand(existing) && !force) {
    return { hookPath: pkgPath, removed: false, restored: false };
  }

  const hooks = pkg["simple-git-hooks"];
  if (hooks) delete hooks[HOOK_NAME];
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  return { hookPath: pkgPath, removed: true, restored: false };
}
