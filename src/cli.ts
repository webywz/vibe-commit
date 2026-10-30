#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
import { formatHtml } from "./html.ts";
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
      process.stderr.write(`${renderError(error.message, Boolean(process.env.NO_COLOR))}\n\n${helpText()}`);
      return 1;
    }
    throw error;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${renderVersion(readVersion(), options.noColor)}\n`);
    return 0;
  }

  if (options.command === "init") {
    return runInit(options.path, options.force, options.json, options.noColor);
  }
  if (options.command === "install") {
    return runInstall(options.path, options.json, options.noColor);
  }
  if (options.command === "uninstall") {
    return runUninstall(options.path, options.json, options.noColor);
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
    const htmlOnStdout = options.html === true;
    const htmlPath = typeof options.html === "string" ? options.html : undefined;
    const html =
      options.html !== undefined
        ? formatHtml(diff, message, { vibe: options.vibe })
        : undefined;

    if (options.github) {
      const ann = formatGitHubAnnotations(message, diff, {
        maxAnnotations: options.maxAnnotations,
      });
      // Keep --json / --html stdout parseable; annotations ride on stderr.
      if (options.json || htmlOnStdout) process.stderr.write(ann);
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

    const writeOut = (content: string): boolean => {
      if (!options.out) return true;
      try {
        writeFileSync(options.out, content, "utf8");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`vibe-commit: failed to write --out ${options.out}: ${msg}\n`);
        return false;
      }
    };

    if (options.json) {
      const jsonOutput = `${JSON.stringify({ ...message, formatted }, null, 2)}\n`;
      process.stdout.write(jsonOutput);
      if (!writeOut(jsonOutput)) return 1;
    } else if (htmlOnStdout && html !== undefined) {
      process.stdout.write(html.endsWith("\n") ? html : `${html}\n`);
      if (options.out && !options.quiet) {
        const report = renderProposal(diff, message, { noColor: options.noColor });
        if (!writeOut(report)) return 1;
      }
    } else if (!options.quiet) {
      let report: string;
      if (piped && !options.out) {
        report = `${formatted}\n`;
      } else {
        report = renderProposal(diff, message, { noColor: options.noColor });
      }

      if (options.out) {
        if (options.github && !htmlPath) {
          process.stdout.write("::group::vibe-commit report\n");
        }
        if (!writeOut(report)) return 1;
        if (options.github && !htmlPath) {
          process.stdout.write("::endgroup::\n");
        }
      } else if (!htmlPath) {
        if (options.github) {
          process.stdout.write("::group::vibe-commit report\n");
        }
        process.stdout.write(report);
        if (options.github) {
          process.stdout.write("::endgroup::\n");
        }
      }
    }

    if (htmlPath && html !== undefined) {
      try {
        mkdirSync(dirname(htmlPath), { recursive: true });
        const payload = html.endsWith("\n") ? html : `${html}\n`;
        writeFileSync(htmlPath, payload, "utf8");
        if (!options.quiet) {
          process.stderr.write(`wrote html report to ${htmlPath}\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`vibe-commit: failed to write ${htmlPath}: ${msg}\n`);
        return 1;
      }
    }

    if (shouldCommit) {
      commitWithMessage(formatted);
      if (!piped && !options.json && !htmlOnStdout && !options.quiet) {
        const colors = options.noColor ? pc.createColors(false) : pc;
        process.stdout.write(`  ${colors.green("committed")}\n\n`);
      }
    }

    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text, options.noColor)}\n`);
    return 1;
  }
}

function runInit(repoPath?: string, force?: boolean, json?: boolean, noColor = false): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = initHook(target, { force });

    if (json) {
      const output = {
        manager: result.manager,
        targetPath: result.targetPath,
        created: result.created,
        updated: result.updated,
        backedUp: result.backedUp,
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return 0;
    }

    const colors = noColor ? pc.createColors(false) : pc;
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
      `${colors.green("ok")}  prepare-commit-msg hook ${action} (${managerLabel[result.manager]})\n` +
        `     ${result.targetPath}\n`,
    );

    if (result.backedUp) {
      process.stdout.write(
        `     previous hook backed up as ${HOOK_BACKUP_NAME}\n`,
      );
    }

    process.stdout.write("\n");
    process.stdout.write(`${colors.bold("Next steps")} · 后续步骤\n`);

    if (result.manager === "simple-git-hooks") {
      process.stdout.write(
        `  1. Run ${colors.cyan("npx simple-git-hooks")} to install hooks\n` +
          `     运行 ${colors.cyan("npx simple-git-hooks")} 安装钩子\n`,
      );
      process.stdout.write(
        `  2. Plain ${colors.cyan("git commit")} (no -m) will fill an empty message\n` +
          `     裸 ${colors.cyan("git commit")}（无 -m）会填充空消息\n`,
      );
    } else {
      process.stdout.write(
        `  • Plain ${colors.cyan("git commit")} (no -m) will fill an empty message\n` +
          `    裸 ${colors.cyan("git commit")}（无 -m）会填充空消息\n`,
      );
    }

    process.stdout.write("\n");
    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text, noColor)}\n`);
    return 1;
  }
}

function runInstall(repoPath?: string, json?: boolean, noColor = false): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = installHook(target);

    if (json) {
      const output = {
        ok: true,
        action: result.updated ? "updated" : result.created ? "installed" : "installed",
        manager: "bare" as const,
        path: result.hookPath,
        hookPath: result.hookPath,
        created: result.created,
        updated: result.updated,
        backedUp: result.backedUp,
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return 0;
    }

    const colors = noColor ? pc.createColors(false) : pc;
    const action = result.updated
      ? "updated"
      : result.created
        ? "installed"
        : "installed";
    process.stdout.write(
      `${colors.green("ok")}  prepare-commit-msg hook ${action}\n` +
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
    if (json) {
      const errorMessage = error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
      process.stderr.write(`${JSON.stringify({ ok: false, error: errorMessage }, null, 2)}\n`);
      return 1;
    }
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text, noColor)}\n`);
    return 1;
  }
}

function runUninstall(repoPath?: string, json?: boolean, noColor = false): number {
  try {
    const target = resolve(repoPath ?? process.cwd());
    const result = uninstallHook(target);

    if (json) {
      if (!result.removed) {
        const output = {
          ok: true,
          action: "skipped" as const,
          manager: "bare" as const,
          path: result.hookPath,
          hookPath: result.hookPath,
          removed: false,
          restored: false,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        return 0;
      }
      const output = {
        ok: true,
        action: "removed" as const,
        manager: "bare" as const,
        path: result.hookPath,
        hookPath: result.hookPath,
        removed: true,
        restored: result.restored,
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return 0;
    }

    const colors = noColor ? pc.createColors(false) : pc;
    if (!result.removed) {
      process.stdout.write(
        `${colors.yellow("skip")}  no managed vibe-commit hook found\n` +
          `      ${result.hookPath}\n`,
      );
      return 0;
    }
    process.stdout.write(
      `${colors.green("ok")}  prepare-commit-msg hook removed\n` +
        `     ${result.hookPath}\n`,
    );
    if (result.restored) {
      process.stdout.write(`     previous hook restored from backup\n`);
    }
    return 0;
  } catch (error) {
    if (json) {
      const errorMessage = error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
      process.stderr.write(`${JSON.stringify({ ok: false, error: errorMessage }, null, 2)}\n`);
      return 1;
    }
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text, noColor)}\n`);
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
        `${renderError(error instanceof Error ? error.message : "Unexpected error", Boolean(process.env.NO_COLOR))}\n`,
      );
      process.exit(1);
    },
  );
}
