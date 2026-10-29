import {
  COMMIT_TYPES,
  VIBES,
  type CliOptions,
  type CommitType,
  type Vibe,
} from "./types.ts";

const HELP = `vibe-commit — stylish conventional commits, offline-first

Usage
  vibe-commit [options]

Options
  --commit            Create the commit with the proposed message
  --dry-run           Print the message only (default)
  --type <type>       feat | fix | docs | style | refactor | perf | test | build | ci | chore
  --scope <scope>     Override inferred scope
  --vibe <style>      playful | pro | terse          (default: pro)
  --no-ai             Skip AI even if OPENAI_API_KEY is set
  --json              Print a machine-readable proposal
  -h, --help          Show help
  -v, --version       Show version

Env
  OPENAI_API_KEY      Optional. When set, draft with an OpenAI-compatible API
  OPENAI_MODEL        Default: gpt-4o-mini
  OPENAI_BASE_URL     Default: https://api.openai.com/v1
  VIBE / VIBE_COMMIT_VIBE   Default vibe when --vibe is omitted

Examples
  git add -p
  vibe-commit
  vibe-commit --vibe playful --commit
  git commit -m "$(vibe-commit --dry-run)"
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
    commit: false,
    dryRun: false,
    vibe: defaultVibeFromEnv(env),
    noAi: false,
    json: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
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
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    throw new UsageError(`Unexpected argument: ${arg}`);
  }

  return options;
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
