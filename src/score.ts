import type { CommitType, ProposedMessage } from "./types.ts";

/**
 * Deterministic 0–100 CI risk score from a proposal.
 *
 * Aligns with {@link proposalAnnotationType} tiers:
 * breaking → error (100), fix → warning (70),
 * feat/perf/refactor → notice (45), other types → notice (15).
 *
 * Offline / local-safe: no network, no I/O.
 */
export function riskScore(
  proposal: Pick<ProposedMessage, "breaking" | "type">,
): number {
  if (proposal.breaking) return 100;
  switch (proposal.type as CommitType) {
    case "fix":
      return 70;
    case "feat":
    case "perf":
    case "refactor":
      return 45;
    default:
      return 15;
  }
}

/** Strict `>` — same as llm-roast, not prompt-diff's `>=`. */
export function exceedsFailAbove(score: number, threshold: number): boolean {
  return score > threshold;
}

export function failAboveMessage(score: number, threshold: number): string {
  return `vibe-commit: risk score ${score} exceeds --fail-above ${threshold}`;
}
