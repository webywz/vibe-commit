import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleDiff,
  parseNameStatus,
  parseUnifiedDiff,
} from "../src/parse-diff.ts";

describe("parseNameStatus", () => {
  it("parses added, modified, and renamed files", () => {
    const files = parseNameStatus(
      ["A\tsrc/cli.ts", "M\tREADME.md", "R100\tsrc/a.ts\tsrc/b.ts"].join("\n"),
    );
    assert.equal(files.get("src/cli.ts")?.status, "A");
    assert.equal(files.get("README.md")?.status, "M");
    assert.equal(files.get("src/b.ts")?.status, "R");
    assert.equal(files.get("src/b.ts")?.fromPath, "src/a.ts");
  });
});

describe("parseUnifiedDiff", () => {
  it("captures hunks per file", () => {
    const raw = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,3 @@",
      " keep",
      "-old",
      "+new",
    ].join("\n");
    const hunks = parseUnifiedDiff(raw);
    assert.equal(hunks.length, 1);
    assert.equal(hunks[0]?.path, "src/a.ts");
    assert.deepEqual(hunks[0]?.lines, [" keep", "-old", "+new"]);
  });
});

describe("assembleDiff", () => {
  it("joins name-status, numstat, and hunks", () => {
    const diff = assembleDiff(
      "A\tsrc/cli.ts\n",
      "12\t0\tsrc/cli.ts\n",
      [
        "diff --git a/src/cli.ts b/src/cli.ts",
        "--- /dev/null",
        "+++ b/src/cli.ts",
        "@@ -0,0 +1,2 @@",
        "+export const x = 1",
      ].join("\n"),
    );
    assert.equal(diff.files[0]?.path, "src/cli.ts");
    assert.equal(diff.files[0]?.additions, 12);
    assert.equal(diff.hunks[0]?.lines[0], "+export const x = 1");
  });
});
