import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  annotation,
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  escapeData,
  escapeProperty,
  formatGitHubAnnotations,
  formatGitHubStepSummary,
  proposalAnnotationType,
} from "../src/github.ts";
import type { ProposedMessage } from "../src/types.ts";
import { stagedDiff, stagedFile } from "./helpers.ts";

function sampleProposal(partial: Partial<ProposedMessage> = {}): ProposedMessage {
  return {
    type: "feat",
    scope: "auth",
    subject: "add logout",
    body: undefined,
    breaking: false,
    engine: "heuristic",
    ...partial,
  };
}

function sampleDiff() {
  return stagedDiff([
    stagedFile({ path: "src/auth.ts", status: "M", additions: 8, deletions: 0 }),
  ]);
}

describe("github annotations", () => {
  it("escapes workflow command payloads", () => {
    assert.equal(escapeData("a%b\nc\rd"), "a%25b%0Ac%0Dd");
    assert.equal(escapeProperty("file:name,path"), "file%3Aname%2Cpath");
  });

  it("formats a basic annotation line", () => {
    assert.equal(
      annotation("warning", "hello\nworld", { file: "a.ts", line: 3, title: "t:1,2" }),
      "::warning file=a.ts,line=3,title=t%3A1%2C2::hello%0Aworld",
    );
  });

  it("maps breaking / fix to heavier annotation types", () => {
    assert.equal(proposalAnnotationType(sampleProposal({ breaking: true })), "error");
    assert.equal(
      proposalAnnotationType(sampleProposal({ type: "fix", breaking: false })),
      "warning",
    );
    assert.equal(proposalAnnotationType(sampleProposal({ type: "feat" })), "notice");
  });

  it("emits title / file / meta annotations", () => {
    const out = formatGitHubAnnotations(sampleProposal(), sampleDiff());
    assert.match(out, /^::(error|warning|notice) /m);
    assert.match(out, /vibe-commit · title/);
    assert.match(out, /feat\(auth\): add logout/);
    assert.match(out, /vibe-commit · file/);
    assert.match(out, /vibe-commit · meta/);
    for (const line of out.trim().split("\n")) {
      assert.match(line, /^::(error|warning|notice) /);
    }
  });

  it("emits breaking as error", () => {
    const out = formatGitHubAnnotations(
      sampleProposal({
        breaking: true,
        subject: "drop sessions",
        breakingReason: "public export removed",
      }),
      sampleDiff(),
    );
    assert.match(out, /::error /);
    assert.match(out, /public export removed|Breaking change/);
  });

  it("respects maxAnnotations", () => {
    const diff = stagedDiff([
      stagedFile({ path: "a.ts" }),
      stagedFile({ path: "b.ts" }),
      stagedFile({ path: "c.ts" }),
      stagedFile({ path: "d.ts" }),
      stagedFile({ path: "e.ts" }),
    ]);
    const out = formatGitHubAnnotations(sampleProposal(), diff, {
      maxAnnotations: 2,
    });
    assert.equal(out.trim().split("\n").length, 2);
  });

  it("appends job outputs when GITHUB_OUTPUT is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibe-commit-gh-"));
    const outFile = join(dir, "github_output");
    const prev = process.env.GITHUB_OUTPUT;
    try {
      process.env.GITHUB_OUTPUT = outFile;
      appendGitHubJobOutput(sampleProposal(), sampleDiff());
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /^title=feat\(auth\): add logout$/m);
      assert.match(body, /^subject=add logout$/m);
      assert.match(body, /^type=feat$/m);
      assert.match(body, /^scope=auth$/m);
      assert.match(body, /^breaking=false$/m);
      assert.match(body, /^engine=heuristic$/m);
      assert.match(body, /^findings=1$/m);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats a concise step summary", () => {
    const md = formatGitHubStepSummary(sampleProposal(), sampleDiff());
    assert.match(md, /## vibe-commit/);
    assert.match(md, /\*\*Title\*\*/);
    assert.match(md, /Staged files|src\/auth\.ts/);
  });

  it("appends step summary when GITHUB_STEP_SUMMARY is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibe-commit-gh-sum-"));
    const outFile = join(dir, "step_summary.md");
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      process.env.GITHUB_STEP_SUMMARY = outFile;
      appendGitHubStepSummary(sampleProposal(), sampleDiff());
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /## vibe-commit/);
      assert.match(body, /Title/);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops step summary when GITHUB_STEP_SUMMARY is unset", () => {
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      delete process.env.GITHUB_STEP_SUMMARY;
      appendGitHubStepSummary(sampleProposal(), sampleDiff());
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
    }
  });
});
