import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale, Vibe } from "./types.ts";
import { LOCALES, VIBES } from "./types.ts";

export interface ProjectConfig {
  locale?: Locale;
  vibe?: Vibe;
}

export function loadProjectConfig(
  cwd = process.cwd(),
): ProjectConfig | undefined {
  const vibeCommitPath = join(cwd, ".vibe-commit.json");
  if (existsSync(vibeCommitPath)) {
    try {
      const raw = readFileSync(vibeCommitPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return normalizeConfig(parsed);
    } catch {
      return undefined;
    }
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        parsed.vibeCommit &&
        typeof parsed.vibeCommit === "object" &&
        !Array.isArray(parsed.vibeCommit)
      ) {
        return normalizeConfig(parsed.vibeCommit as Record<string, unknown>);
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeConfig(raw: Record<string, unknown>): ProjectConfig {
  const config: ProjectConfig = {};

  if (typeof raw.locale === "string") {
    const locale = raw.locale.trim().toLowerCase();
    if ((LOCALES as readonly string[]).includes(locale)) {
      config.locale = locale as Locale;
    }
  }

  if (typeof raw.vibe === "string") {
    const vibe = raw.vibe.trim().toLowerCase();
    if ((VIBES as readonly string[]).includes(vibe)) {
      config.vibe = vibe as Vibe;
    }
  }

  return config;
}

/**
 * Resolve locale with precedence: env (VIBE_COMMIT_LOCALE) > project config > default (en).
 * Use this for contexts where CLI flags are not available (e.g., git hooks).
 */
export function resolveLocale(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Locale {
  const envValue = env.VIBE_COMMIT_LOCALE?.trim().toLowerCase();
  if (envValue && (LOCALES as readonly string[]).includes(envValue)) {
    return envValue as Locale;
  }

  const projectConfig = loadProjectConfig(cwd);
  if (projectConfig?.locale) {
    return projectConfig.locale;
  }

  return "en";
}

/**
 * Resolve vibe with precedence: env (VIBE_COMMIT_VIBE or VIBE) > project config > default (pro).
 * Use this for contexts where CLI flags are not available (e.g., git hooks).
 */
export function resolveVibe(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Vibe {
  const envValue = (env.VIBE_COMMIT_VIBE ?? env.VIBE)?.trim().toLowerCase();
  if (envValue && (VIBES as readonly string[]).includes(envValue)) {
    return envValue as Vibe;
  }

  const projectConfig = loadProjectConfig(cwd);
  if (projectConfig?.vibe) {
    return projectConfig.vibe;
  }

  return "pro";
}
