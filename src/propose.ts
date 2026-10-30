import { proposeWithAi } from "./ai.ts";
import {
  breakingFooterDetail,
  detectBreakingKind,
  ensureBreakingFooter,
  formatBreakingReason,
  proposeHeuristic,
} from "./heuristic.ts";
import type { ProposeOptions, ProposedMessage, StagedDiff } from "./types.ts";

export async function proposeMessage(
  diff: StagedDiff,
  options: ProposeOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProposedMessage> {
  const heuristic = proposeHeuristic({
    diff,
    type: options.type,
    scope: options.scope,
    vibe: options.vibe,
    locale: options.locale,
    breaking: options.breaking,
  });

  let message: ProposedMessage = heuristic;

  if (options.preferAi !== false) {
    const hasKey = Boolean(env.OPENAI_API_KEY?.trim());
    if (hasKey) {
      const ai = await proposeWithAi(
        {
          diff,
          vibe: options.vibe,
          locale: options.locale,
          type: options.type,
          scope: options.scope,
        },
        env,
      );
      if (ai) message = ai;
    }
  }

  const forced = Boolean(options.breaking);
  const breaking =
    forced || heuristic.breaking || message.breaking;
  const kind = detectBreakingKind(diff, forced);
  const breakingReason =
    kind
      ? formatBreakingReason(kind)
      : breaking
        ? heuristic.breakingReason ?? message.breakingReason
        : undefined;
  const withMeta = { ...message, breaking, breakingReason };
  // Forced --breaking: footer uses subject, not bilingual default.
  const footerReason =
    kind === "forced" ? withMeta.subject : breakingFooterDetail(diff);
  return ensureBreakingFooter(withMeta, footerReason);
}
