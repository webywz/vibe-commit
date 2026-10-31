import {
  COMMIT_TYPES,
  DEFAULT_HTML_THEME,
  HTML_THEMES,
  LOCALES,
  VIBES,
  isHtmlTheme,
  type CliCommand,
  type CliOptions,
  type CommitType,
  type HtmlTheme,
  type Locale,
  type Vibe,
} from "./types.ts";
import { resolveLocale, resolveVibe } from "./config.ts";

const HELP = `vibe-commit — stylish conventional commits, offline-first
有品味的 Conventional Commits（离线优先）

Usage · 用法
  vibe-commit [options]
  vibe-commit init [--path <repo>] [--force] [--json]
  vibe-commit install [--path <repo>] [--json]
  vibe-commit uninstall [--path <repo>] [--json]

Commands · 命令
  init                Auto-detect hook manager (husky / simple-git-hooks / bare .git/hooks) and install
                      自动检测钩子管理器并安装
  install             Install a prepare-commit-msg hook in the repo
  uninstall           Remove the managed prepare-commit-msg hook

Options · 参数
  --commit            Create the commit with the proposed message
  --dry-run           Print the message only (default)
  --type <type>       feat | fix | docs | style | refactor | perf | test | build | ci | chore
  --scope <scope>     Override inferred scope
  --vibe <style>      playful | pro | terse          (default: pro)
  --locale <locale>   en | zh                        (default: en)
  --no-ai             Skip AI even if OPENAI_API_KEY is set
  --no-color          Disable ANSI colors in human-readable output
  --breaking          Force ! + BREAKING CHANGE footer (text = subject)
  --json              Print a machine-readable proposal (propose) or result (init/install/uninstall)
                      机器可读提案（propose）或结果（init/install/uninstall）
  --html [path]       Self-contained HTML report (stdout, or write to path; offline, no CDN)
                      自包含 HTML 报告（stdout，或写入路径；离线，无 CDN）
  --theme <name>      HTML palette: ember (default), fog, midnight, paper
                      HTML 配色：ember（默认，与 0.1.27 相同）、fog、midnight、paper
  --github            Emit GitHub Actions annotations (::notice/warning/error)
                      输出 Actions 注解；有 GITHUB_OUTPUT / GITHUB_STEP_SUMMARY 时写输出与 Job Summary
  --quiet             Suppress the pretty terminal report (--json / --github still emit)
                      抑制漂亮终端报告；--json / --github 仍照常
  --max-annotations <n>  Cap GitHub annotation lines (default: 20) · 限制注解条数
  --path <repo>       Repo root for init/install/uninstall (default: cwd)
  --force             Force overwrite when init target already exists (init only)
                      强制覆盖已存在的钩子配置（仅 init）
  --out <file>        Write report (or JSON body with --json) to file (propose only)
                      写报告（或搭配 --json 写 JSON）到文件（仅 propose）
  --fail-above <n>    CI gate: exit 1 when riskScore > n (0–100; omit = off; propose only)
                      CI 门禁：风险分 > n 时以 1 退出（0–100；省略则关闭；仅 propose）
  -h, --help          Show help
  -v, --version       Show version

Env
  OPENAI_API_KEY      Optional. When set, draft with an OpenAI-compatible API
  OPENAI_MODEL        Default: gpt-4o-mini
  OPENAI_BASE_URL     Default: https://api.openai.com/v1
  NO_COLOR            When set (any non-empty value), disable ANSI colors
  VIBE / VIBE_COMMIT_VIBE     Default vibe when --vibe is omitted
  VIBE_COMMIT_LOCALE          Default locale when --locale is omitted
  VIBE_COMMIT_HOOK_AI Set to 1 to allow AI inside the git hook (off by default)

With --github, annotations go to stdout (or stderr when combined with --json / --html) so
PR Checks can surface the proposed commit title / body / staged files. Job outputs
title/subject/type/scope/breaking/engine/findings/riskScore are written when GITHUB_OUTPUT
is set (findings = staged file count). A short Markdown job summary is appended when
GITHUB_STEP_SUMMARY is set. --quiet hides the pretty report only.
--html and --json cannot share stdout; pick one primary export.
--theme only restyles --html (ember = 0.1.27 look). Pretty / JSON / GitHub / scoring unchanged.
--fail-above runs after every report is emitted (json / github / html / quiet / out).

配合 --github 时注解走 stdout（与 --json / --html 联用则走 stderr，保持 JSON 干净）。
有 GITHUB_OUTPUT 时写入 title/subject 等字段；有 GITHUB_STEP_SUMMARY 时追加 Job Summary。
--quiet 只隐藏漂亮终端报告。
--html 与 --json 不能同时占用 stdout；二选一。
--theme 只改 --html 配色（ember = 0.1.27 外观）。漂亮终端 / JSON / GitHub / 打分不变。
--fail-above 在所有报告输出之后再判定（json / github / html / quiet / out）。

Git hook
  After \`vibe-commit init\` or \`vibe-commit install\`, plain \`git commit\` (no -m)
  fills an empty / comment-only message file with a vibe-commit proposal. Skips merge,
  squash, amend (source=commit), and any message that already has non-comment text.
  
  \`init\` auto-detects your hook manager:
    1. husky (package.json has "husky" dep or .husky/ exists) → .husky/prepare-commit-msg
    2. simple-git-hooks (package.json has "simple-git-hooks" dep or config) → set config entry
    3. else bare .git/hooks → install prepare-commit-msg directly
  
  Use \`--force\` to overwrite existing hook/config (creates backup where applicable).

Project config
  .vibe-commit.json or package.json#vibeCommit
    { "locale": "zh", "vibe": "pro" }
  Precedence: CLI > env > project config > default

Examples · 示例
  git add -p
  vibe-commit
  vibe-commit --vibe playful --commit
  vibe-commit --locale zh --dry-run
  vibe-commit --breaking --dry-run
  vibe-commit --github --quiet --no-ai
  vibe-commit --github --json --max-annotations 10
  vibe-commit --fail-above 70 --github --quiet --no-ai
  vibe-commit --html
  vibe-commit --html --theme fog
  vibe-commit --html report.html --theme midnight
  git commit -m "$(vibe-commit --dry-run)"
  vibe-commit init
  vibe-commit init --force
  vibe-commit init --json
  vibe-commit install
  vibe-commit uninstall --path ~/projects/app
`;

export function defaultVibeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Vibe {
  const raw = (env.VIBE_COMMIT_VIBE ?? env.VIBE ?? "pro").trim().toLowerCase();
  return (VIBES as readonly string[]).includes(raw) ? (raw as Vibe) : "pro";
}

export function defaultLocaleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Locale {
  const raw = (env.VIBE_COMMIT_LOCALE ?? "en").trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : "en";
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CliOptions {
  const options: CliOptions = {
    command: "propose",
    commit: false,
    dryRun: false,
    vibe: resolveVibe(env, cwd),
    locale: resolveLocale(env, cwd),
    noAi: false,
    json: false,
    github: false,
    quiet: false,
    maxAnnotations: 20,
    noColor: Boolean(env.NO_COLOR),
    help: false,
    version: false,
    breaking: false,
    force: false,
    theme: DEFAULT_HTML_THEME,
  };

  let i = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    const cmd = parseCommand(argv[0]);
    if (cmd) {
      options.command = cmd;
      i = 1;
    }
  }

  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--commit") {
      options.commit = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-ai") {
      options.noAi = true;
      continue;
    }
    if (arg === "--no-color") {
      options.noColor = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--github") {
      options.github = true;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--max-annotations" || arg.startsWith("--max-annotations=")) {
      const value = arg.includes("=")
        ? arg.slice("--max-annotations=".length)
        : argv[++i];
      options.maxAnnotations = parseMaxAnnotations(value);
      continue;
    }
    if (arg === "--breaking") {
      options.breaking = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--type" || arg.startsWith("--type=")) {
      const value = arg.includes("=") ? arg.slice("--type=".length) : argv[++i];
      options.type = parseType(value);
      continue;
    }
    if (arg === "--scope" || arg.startsWith("--scope=")) {
      const value = arg.includes("=") ? arg.slice("--scope=".length) : argv[++i];
      if (!value) throw new UsageError("Missing value for --scope");
      options.scope = sanitizeScope(value);
      continue;
    }
    if (arg === "--vibe" || arg.startsWith("--vibe=")) {
      const value = arg.includes("=") ? arg.slice("--vibe=".length) : argv[++i];
      options.vibe = parseVibe(value);
      continue;
    }
    if (arg === "--locale" || arg.startsWith("--locale=")) {
      const value = arg.includes("=") ? arg.slice("--locale=".length) : argv[++i];
      options.locale = parseLocale(value);
      continue;
    }
    if (arg === "--path" || arg.startsWith("--path=")) {
      const value = arg.includes("=") ? arg.slice("--path=".length) : argv[++i];
      if (!value) throw new UsageError("Missing value for --path");
      options.path = value;
      continue;
    }
    if (arg === "--out" || arg.startsWith("--out=")) {
      const value = arg.includes("=") ? arg.slice("--out=".length) : argv[++i];
      if (!value) throw new UsageError("Missing value for --out");
      options.out = value;
      continue;
    }
    if (arg === "--fail-above" || arg.startsWith("--fail-above=")) {
      const value = arg.includes("=")
        ? arg.slice("--fail-above=".length)
        : argv[++i];
      options.failAbove = parseFailAbove(value);
      continue;
    }
    if (arg === "--theme" || arg.startsWith("--theme=")) {
      const value = arg.includes("=") ? arg.slice("--theme=".length) : argv[++i];
      options.theme = parseTheme(value);
      continue;
    }
    if (arg === "--html") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options.html = next;
        i += 1;
      } else {
        options.html = true;
      }
      continue;
    }
    if (arg.startsWith("--html=")) {
      const inline = arg.slice("--html=".length);
      options.html = inline === "" ? true : inline;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    }

    if (options.command === "prepare-commit-msg") {
      if (!options.messageFile) {
        options.messageFile = arg;
        continue;
      }
      if (!options.commitSource) {
        options.commitSource = arg;
        continue;
      }
      throw new UsageError(`Unexpected argument: ${arg}`);
    }

    throw new UsageError(`Unexpected argument: ${arg}`);
  }

  if (options.command === "prepare-commit-msg" && !options.messageFile) {
    throw new UsageError(
      "prepare-commit-msg requires a message file path (git passes this automatically)",
    );
  }

  if (
    options.path &&
    options.command !== "init" &&
    options.command !== "install" &&
    options.command !== "uninstall"
  ) {
    throw new UsageError("--path is only valid with init, install or uninstall");
  }

  if (options.force && options.command !== "init") {
    throw new UsageError("--force is only valid with init");
  }

  if (options.out && options.command !== "propose") {
    throw new UsageError("--out is only valid with propose (default command)");
  }

  if (options.html && options.json) {
    throw new UsageError(
      "--html cannot be combined with --json (choose one primary export)",
    );
  }

  if (options.html && options.command !== "propose") {
    throw new UsageError("--html is only valid with propose (default command)");
  }

  if (options.failAbove !== undefined && options.command !== "propose") {
    throw new UsageError("--fail-above is only valid with propose (default command)");
  }

  if (
    options.theme !== DEFAULT_HTML_THEME &&
    options.command !== "propose"
  ) {
    throw new UsageError("--theme is only valid with propose (default command)");
  }

  return options;
}

function parseCommand(value: string): CliCommand | null {
  switch (value) {
    case "init":
    case "install":
    case "uninstall":
    case "prepare-commit-msg":
      return value;
    default:
      return null;
  }
}

export function parseFailAbove(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    throw new UsageError("--fail-above requires an integer from 0 to 100");
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new UsageError("--fail-above requires an integer from 0 to 100");
  }
  return n;
}

export function parseMaxAnnotations(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) throw new UsageError("Missing value for --max-annotations");
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new UsageError("--max-annotations must be a positive integer");
  }
  return n;
}

export function parseType(value: string | undefined): CommitType {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --type");
  if (!(COMMIT_TYPES as readonly string[]).includes(raw)) {
    throw new UsageError(
      `Invalid --type "${value}". Use: ${COMMIT_TYPES.join(", ")}`,
    );
  }
  return raw as CommitType;
}

export function parseVibe(value: string | undefined): Vibe {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --vibe");
  if (!(VIBES as readonly string[]).includes(raw)) {
    throw new UsageError(`Invalid --vibe "${value}". Use: ${VIBES.join(", ")}`);
  }
  return raw as Vibe;
}

export function parseLocale(value: string | undefined): Locale {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --locale");
  if (!(LOCALES as readonly string[]).includes(raw)) {
    throw new UsageError(`Invalid --locale "${value}". Use: ${LOCALES.join(", ")}`);
  }
  return raw as Locale;
}

export function parseTheme(value: string | undefined): HtmlTheme {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --theme");
  if (!isHtmlTheme(raw)) {
    throw new UsageError(
      `Invalid --theme "${value}". Use: ${HTML_THEMES.join(", ")}`,
    );
  }
  return raw;
}

export function sanitizeScope(value: string): string {
  const scope = value.trim().replace(/^[\s(/]+|[\s)/]+$/g, "");
  if (!scope) throw new UsageError("Scope cannot be empty");
  return scope;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function helpText(): string {
  return HELP;
}
