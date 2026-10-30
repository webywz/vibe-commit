import { proposeWithAi } from "./ai.ts";
import {
  breakingReason,
  ensureBreakingFooter,
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
          type: options.type,
          scope: options.scope,
        },
        env,
      );
      if (ai) message = ai;
    }
  }

  const breaking =
    Boolean(options.breaking) || heuristic.breaking || message.breaking;
  return ensureBreakingFooter(
    { ...message, breaking },
    breakingReason(diff),
  );
}
