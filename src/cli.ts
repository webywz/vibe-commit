#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { formatCommit } from "./format.ts";
import { commitWithMessage, GitError, inspectStaged } from "./git.ts";
import {
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  formatGitHubAnnotations,
} from "./github.ts";
import {
  initHook,
  installHook,
  uninstallHook,
  runPrepareCommitMsg,
  HOOK_BACKUP_NAME,
} from "./hook.ts";
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

  if (options.command === "init") {
    return runInit(options.path, options.force);
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
      locale: options.locale,
      preferAi: !options.noAi,
      breaking: options.breaking,
    });
    const formatted = formatCommit(message);
    const shouldCommit = options.commit && !options.dryRun;

    if (options.github) {
      const ann = formatGitHubAnnotations(message, diff, {
        maxAnnotations: options.maxAnnotations,
      });
      // Keep --json stdout machine-parseable; annotations ride on stderr.
      if (options.json) process.stderr.write(ann);
      else process.stdout.write(ann);
      try {
        appendGitHubJobOutput(message, diff);
      } catch (err) {
        process.stderr.write(
          `vibe-commit: GITHUB_OUTPUT skipped (${err instanceof Error ? err.message : err})\n`,
        );
      }
      try {
        appendGitHubStepSummary(message, diff);
      } catch (err) {
        process.stderr.write(
          `vibe-commit: GITHUB_STEP_SUMMARY skipped (${err instanceof Error ? err.message : err})\n`,
        );
      }
    }

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ...message, formatted }, null, 2)}\n`,
      );
    } else if (!options.quiet) {
      if (options.github) {
        process.stdout.write("::group::vibe-commit report\n");
      }
      if (piped) {
        process.stdout.write(`${formatted}\n`);
      } else {
        process.stdout.write(renderProposal(diff, message));
      }
      if (options.github) {
        process.stdout.write("::endgroup::\n");
      }
    }

    if (shouldCommit) {
      commitWithMessage(formatted);
      if (!piped && !options.json && !options.quiet) {
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

function runInit(repoPath?: string, force?: boolean): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = initHook(target, { force });

    const managerLabel: Record<typeof result.manager, string> = {
      husky: "husky",
      "simple-git-hooks": "simple-git-hooks",
      bare: "bare .git/hooks",
    };

    const action = result.updated
      ? "updated"
      : result.created
        ? "installed"
        : "configured";

    process.stdout.write(
      `${pc.green("ok")}  prepare-commit-msg hook ${action} (${managerLabel[result.manager]})\n` +
        `     ${result.targetPath}\n`,
    );

    if (result.backedUp) {
      process.stdout.write(
        `     previous hook backed up as ${HOOK_BACKUP_NAME}\n`,
      );
    }

    // Next steps (bilingual)
    process.stdout.write("\n");
    process.stdout.write(`${pc.bold("Next steps")} · 后续步骤\n`);

    if (result.manager === "simple-git-hooks") {
      process.stdout.write(
        `  1. Run ${pc.cyan("npx simple-git-hooks")} to install hooks\n` +
          `     运行 ${pc.cyan("npx simple-git-hooks")} 安装钩子\n`,
      );
      process.stdout.write(
        `  2. Plain ${pc.cyan("git commit")} (no -m) will fill an empty message\n` +
          `     裸 ${pc.cyan("git commit")}（无 -m）会填充空消息\n`,
      );
    } else {
      process.stdout.write(
        `  • Plain ${pc.cyan("git commit")} (no -m) will fill an empty message\n` +
          `    裸 ${pc.cyan("git commit")}（无 -m）会填充空消息\n`,
      );
    }

    process.stdout.write("\n");
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
  const self = fileURLToPath(import.meta.url);
  try {
    // npm/.bin and npx invoke via symlink; compare real paths (align agent-trace / context-diet).
    return (
      realpathSync(entry) === self ||
      realpathSync(entry) === realpathSync(self)
    );
  } catch {
    return /(cli\.(js|ts)|vibe-commit)$/.test(entry);
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
