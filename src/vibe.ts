import { clip } from "./format.ts";
import type { CommitType, Vibe } from "./types.ts";

export interface VibeDraft {
  type: CommitType;
  scope?: string;
  subject: string;
  body?: string;
  breaking: boolean;
}

export function applyVibe(draft: VibeDraft, vibe: Vibe): VibeDraft {
  const subject = stylizeSubject(draft, vibe);
  const body = stylizeBody(draft, vibe);
  return { ...draft, subject, body };
}

function stylizeSubject(draft: VibeDraft, vibe: Vibe): string {
  const core = draft.subject.trim();
  if (vibe === "terse") return clip(stripFiller(core), 50);
  if (vibe === "pro") return clip(core, 72);
  return clip(playfulSubject(draft.type, core), 72);
}

function stylizeBody(draft: VibeDraft, vibe: Vibe): string | undefined {
  if (vibe === "terse") return undefined;
  const body = draft.body?.trim();
  if (!body) return undefined;
  if (vibe === "pro") return body;
  const extra = playfulBodyNote(draft.type);
  return extra && !body.includes(extra) ? `${body}\n\n${extra}` : body;
}

function stripFiller(text: string): string {
  return text
    .replace(/\b(the|a|an|that|which|with|from|into)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function playfulSubject(type: CommitType, core: string): string {
  const seed = `${type}:${core}`;
  const options = playfulOptions(type, core);
  return pick(seed, options);
}

function playfulOptions(type: CommitType, core: string): string[] {
  switch (type) {
    case "feat":
      return [
        core,
        `ship ${core.replace(/^add\s+/, "")}`,
        `${core} — quietly useful`,
        `give the repo ${core.replace(/^add\s+/, "")}`,
      ];
    case "fix":
      return [
        core,
        `stop the ${core.replace(/^fix\s+/, "")} weirdness`,
        `patch ${core.replace(/^fix\s+/, "")} before it spreads`,
        `${core} (the unglamorous kind)`,
      ];
    case "docs":
      return [
        core,
        `tell humans about ${core.replace(/^update\s+/, "").replace(/^document\s+/, "")}`,
        `${core} so future-us remembers`,
      ];
    case "refactor":
      return [
        core,
        `tidy ${core.replace(/^refactor\s+/, "")} without changing the plot`,
        `${core} — same behavior, less fog`,
      ];
    case "test":
      return [
        core,
        `make ${core.replace(/^add\s+/, "").replace(/^test\s+/, "")} prove itself`,
        `${core} so regressions can't hide`,
      ];
    case "chore":
      return [
        core,
        `keep ${core.replace(/^update\s+/, "")} in fighting shape`,
        `${core} (housekeeping)`,
      ];
    case "ci":
      return [
        core,
        `keep CI honest: ${core.replace(/^update\s+/, "")}`,
        `${core} so green means green`,
      ];
    case "perf":
      return [
        core,
        `make ${core.replace(/^improve\s+/, "")} snappier`,
        `${core} — fewer wasted cycles`,
      ];
    default:
      return [core];
  }
}

function playfulBodyNote(type: CommitType): string {
  switch (type) {
    case "feat":
      return "Shipped with a straight face; the fun is in the details.";
    case "fix":
      return "Less mystery, more green tests.";
    case "docs":
      return "Written for the next person who is, statistically, you.";
    default:
      return "";
  }
}

export function pick(seed: string, options: string[]): string {
  if (options.length === 0) return "";
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % options.length;
  return options[index] ?? options[0] ?? "";
}
