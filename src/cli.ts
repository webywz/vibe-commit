#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pc from "picocolors";
import { formatCommit } from "./format.ts";
import { commitWithMessage, GitError, inspectStaged } from "./git.ts";
import { installHook, uninstallHook, runPrepareCommitMsg } from "./hook.ts";
import { helpText, parseArgs, UsageError } from "./parse-args.ts";
import { proposeMessage } from "./propose.ts";
import { renderError, renderProposal, renderVersion } from "./render.ts";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${renderError(error.message)}\n\n${helpText()}`);
      return 1;
    }
    throw error;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${renderVersion(readVersion())}\n`);
    return 0;
  }

  if (options.command === "install") {
    return runInstall(options.path);
  }
  if (options.command === "uninstall") {
    return runUninstall(options.path);
  }
  if (options.command === "prepare-commit-msg") {
    return runHookPrepare(options.messageFile!, options.commitSource);
  }

  const piped = !process.stdout.isTTY;
  try {
    const diff = inspectStaged();
    const message = await proposeMessage(diff, {
      type: options.type,
      scope: options.scope,
      vibe: options.vibe,
      preferAi: !options.noAi,
    });
    const formatted = formatCommit(message);
    const shouldCommit = options.commit && !options.dryRun;

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ...message, formatted }, null, 2)}\n`,
      );
    } else if (piped) {
      process.stdout.write(`${formatted}\n`);
    } else {
      process.stdout.write(renderProposal(diff, message));
    }

    if (shouldCommit) {
      commitWithMessage(formatted);
      if (!piped && !options.json) {
        process.stdout.write(`  ${pc.green("committed")}\n\n`);
      }
    }

    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text)}\n`);
    return 1;
  }
}

function runInstall(repoPath?: string): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = installHook(target);
    const action = result.updated
      ? "updated"
      : result.created
        ? "installed"
        : "installed";
    process.stdout.write(
      `${pc.green("ok")}  prepare-commit-msg hook ${action}\n` +
        `     ${result.hookPath}\n`,
    );
    if (result.backedUp) {
      process.stdout.write(
        `     previous hook backed up as prepare-commit-msg.vibe-backup\n`,
      );
    }
    process.stdout.write(
      `     tip: plain \`git commit\` (no -m) will fill an empty message\n`,
    );
    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text)}\n`);
    return 1;
  }
}

function runUninstall(repoPath?: string): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = uninstallHook(target);
    if (!result.removed) {
      process.stdout.write(
        `${pc.yellow("skip")}  no managed vibe-commit hook found\n` +
          `      ${result.hookPath}\n`,
      );
      return 0;
    }
    process.stdout.write(
      `${pc.green("ok")}  prepare-commit-msg hook removed\n` +
        `     ${result.hookPath}\n`,
    );
    if (result.restored) {
      process.stdout.write(`     previous hook restored from backup\n`);
    }
    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text)}\n`);
    return 1;
  }
}

async function runHookPrepare(
  messageFile: string,
  commitSource?: string,
): Promise<number> {
  try {
    await runPrepareCommitMsg(messageFile, commitSource, process.cwd());
  } catch {
    // Never fail a commit because the hook misfired.
  }
  return 0;
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `${renderError(error instanceof Error ? error.message : "Unexpected error")}\n`,
      );
      process.exit(1);
    },
  );
}
