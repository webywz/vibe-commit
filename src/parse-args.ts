import {
  COMMIT_TYPES,
  VIBES,
  type CliCommand,
  type CliOptions,
  type CommitType,
  type Vibe,
} from "./types.ts";

const HELP = `vibe-commit — stylish conventional commits, offline-first

Usage
  vibe-commit [options]
  vibe-commit install [--path <repo>]
  vibe-commit uninstall [--path <repo>]

Commands
  install             Install a prepare-commit-msg hook in the repo
  uninstall           Remove the managed prepare-commit-msg hook

Options
  --commit            Create the commit with the proposed message
  --dry-run           Print the message only (default)
  --type <type>       feat | fix | docs | style | refactor | perf | test | build | ci | chore
  --scope <scope>     Override inferred scope
  --vibe <style>      playful | pro | terse          (default: pro)
  --no-ai             Skip AI even if OPENAI_API_KEY is set
  --breaking          Force breaking change (! + BREAKING CHANGE footer)
  --json              Print a machine-readable proposal
  --path <repo>       Repo root for install/uninstall (default: cwd)
  -h, --help          Show help
  -v, --version       Show version

Env
  OPENAI_API_KEY      Optional. When set, draft with an OpenAI-compatible API
  OPENAI_MODEL        Default: gpt-4o-mini
  OPENAI_BASE_URL     Default: https://api.openai.com/v1
  VIBE / VIBE_COMMIT_VIBE   Default vibe when --vibe is omitted
  VIBE_COMMIT_HOOK_AI Set to 1 to allow AI inside the git hook (off by default)

Git hook
  After \`vibe-commit install\`, plain \`git commit\` (no -m) fills an empty /
  comment-only message file with a vibe-commit proposal. Skips merge, squash,
  amend (source=commit), and any message that already has non-comment text.

Examples
  git add -p
  vibe-commit
  vibe-commit --vibe playful --commit
  vibe-commit --breaking --dry-run
  git commit -m "$(vibe-commit --dry-run)"
  vibe-commit install
  vibe-commit uninstall --path ~/projects/app
`;

export function defaultVibeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Vibe {
  const raw = (env.VIBE_COMMIT_VIBE ?? env.VIBE ?? "pro").trim().toLowerCase();
  return (VIBES as readonly string[]).includes(raw) ? (raw as Vibe) : "pro";
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const options: CliOptions = {
    command: "propose",
    commit: false,
    dryRun: false,
    vibe: defaultVibeFromEnv(env),
    noAi: false,
    json: false,
    help: false,
    version: false,
    breaking: false,
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
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--breaking") {
      options.breaking = true;
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
    if (arg === "--path" || arg.startsWith("--path=")) {
      const value = arg.includes("=") ? arg.slice("--path=".length) : argv[++i];
      if (!value) throw new UsageError("Missing value for --path");
      options.path = value;
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
    options.command !== "install" &&
    options.command !== "uninstall"
  ) {
    throw new UsageError("--path is only valid with install or uninstall");
  }

  return options;
}

function parseCommand(value: string): CliCommand | null {
  switch (value) {
    case "install":
    case "uninstall":
    case "prepare-commit-msg":
      return value;
    default:
      return null;
  }
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
