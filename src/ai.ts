import { parseCommit } from "./format.ts";
import type { ProposedMessage, StagedDiff, Vibe } from "./types.ts";
import type { CommitType } from "./types.ts";

const MAX_DIFF_CHARS = 12_000;

export interface AiContext {
  diff: StagedDiff;
  vibe: Vibe;
  type?: CommitType;
  scope?: string;
}

export async function proposeWithAi(
  context: AiContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProposedMessage | null> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: context.vibe === "playful" ? 0.7 : 0.2,
        messages: [
          { role: "system", content: systemPrompt(context.vibe) },
          { role: "user", content: userPrompt(context) },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = parseCommit(content, "ai");
    if (!parsed) return null;
    if (context.type) parsed.type = context.type;
    if (context.scope) parsed.scope = context.scope;
    return parsed;
  } catch {
    return null;
  }
}

function systemPrompt(vibe: Vibe): string {
  const vibeLine =
    vibe === "playful"
      ? "Tone: witty, still professional; no memes, no emoji, no slang that would embarrass a code review."
      : vibe === "terse"
        ? "Tone: as short as possible. Headline only, no body."
        : "Tone: clear, professional, imperative mood.";
  return `You write conventional commit messages.
Return only the commit message, no quotes, no markdown fences.
Format: type(scope): subject
Optional body after a blank line.
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
Subject: lowercase, imperative, no trailing period, <= 72 chars.
${vibeLine}`;
}

function userPrompt(context: AiContext): string {
  const files = context.diff.files
    .map((file) => {
      const rename = file.fromPath ? ` (from ${file.fromPath})` : "";
      return `${file.status} ${file.path}${rename}  +${file.additions} -${file.deletions}`;
    })
    .join("\n");
  const hints = [
    context.type ? `Forced type: ${context.type}` : null,
    context.scope ? `Forced scope: ${context.scope}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const raw = context.diff.raw.slice(0, MAX_DIFF_CHARS);
  return [
    hints,
    "Staged files:",
    files,
    "",
    "Diff:",
    raw || "(binary or empty hunks)",
  ]
    .filter(Boolean)
    .join("\n");
}
