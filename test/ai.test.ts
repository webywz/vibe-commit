import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { proposeWithAi } from "../src/ai.ts";
import { proposeMessage } from "../src/propose.ts";
import { stagedDiff, stagedFile } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const diff = stagedDiff([
  stagedFile({ path: "src/cli.ts", status: "A", additions: 20, deletions: 0 }),
]);

describe("proposeWithAi", () => {
  it("returns null when no API key is set", async () => {
    const result = await proposeWithAi(
      { diff, vibe: "pro", locale: "en" },
      { OPENAI_API_KEY: "" },
    );
    assert.equal(result, null);
  });

  it("parses an OpenAI-compatible response", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "feat(cli): add a snappy commit writer" } },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    const result = await proposeWithAi(
      { diff, vibe: "pro", locale: "en" },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result?.engine, "ai");
    assert.equal(result?.type, "feat");
    assert.equal(result?.scope, "cli");
    assert.equal(result?.subject, "add a snappy commit writer");
    assert.equal(result?.locale, "en");
  });

  it("falls back when the provider errors", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as typeof fetch;
    const result = await proposeWithAi(
      { diff, vibe: "pro", locale: "en" },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result, null);
  });
});

describe("proposeMessage", () => {
  it("uses the heuristic when AI is disabled", async () => {
    const result = await proposeMessage(
      diff,
      { vibe: "pro", locale: "en", preferAi: false },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result.engine, "heuristic");
    assert.equal(result.locale, "en");
  });
});
