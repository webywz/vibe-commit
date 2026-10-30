import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCommit } from "../src/format.ts";
import {
  ensureBreakingFooter,
  inferBreaking,
  inferScope,
  inferSubject,
  inferType,
  proposeHeuristic,
  stem,
} from "../src/heuristic.ts";
import {
  addedLines,
  deletedLines,
  mixedHunk,
  stagedDiff,
  stagedFile,
  statuses,
} from "./helpers.ts";

describe("inferType", () => {
  it("classifies documentation-only changes as docs", () => {
    const diff = stagedDiff([
      stagedFile({ path: "README.md", additions: 20, deletions: 3 }),
    ]);
    assert.equal(inferType(diff), "docs");
  });

  it("classifies test files as test", () => {
    const diff = stagedDiff([
      stagedFile({ path: "test/format.test.ts", status: statuses.add }),
    ]);
    assert.equal(inferType(diff), "test");
  });

  it("classifies GitHub workflows as ci", () => {
    const diff = stagedDiff([
      stagedFile({ path: ".github/workflows/ci.yml", additions: 40 }),
    ]);
    assert.equal(inferType(diff), "ci");
  });

  it("classifies package manifests as chore", () => {
    const diff = stagedDiff([
      stagedFile({ path: "package.json" }),
      stagedFile({ path: "package-lock.json", additions: 80, deletions: 12 }),
    ]);
    assert.equal(inferType(diff), "chore");
  });

  it("uses feat for new source files", () => {
    const diff = stagedDiff(
      [stagedFile({ path: "src/auth.ts", status: statuses.add, additions: 40, deletions: 0 })],
      [addedLines("src/auth.ts", "export function login() {\n  return true;\n}")],
    );
    assert.equal(inferType(diff), "feat");
  });

  it("detects fix from comment keywords, not from regex source", () => {
    const commented = stagedDiff(
      [stagedFile({ path: "src/parser.ts" })],
      [
        addedLines(
          "src/parser.ts",
          "// fix crash on empty hunks\nif (!header) return [];",
        ),
      ],
    );
    assert.equal(inferType(commented), "fix");

    const regexSource = stagedDiff(
      [stagedFile({ path: "src/heuristic.ts", status: statuses.add })],
      [
        addedLines(
          "src/heuristic.ts",
          'const FIX_WORD_RE = /\\b(fix|bug)\\b/i;\nexport function inferType() {}',
        ),
      ],
    );
    assert.equal(inferType(regexSource), "feat");
  });

  it("detects refactor from rename-only changes", () => {
    const diff = stagedDiff([
      stagedFile({
        path: "src/format.ts",
        fromPath: "src/fmt.ts",
        status: statuses.rename,
      }),
    ]);
    assert.equal(inferType(diff), "refactor");
  });

  it("prefers feat over docs when source and readme both change", () => {
    const diff = stagedDiff([
      stagedFile({ path: "src/cli.ts", status: statuses.add, additions: 30, deletions: 0 }),
      stagedFile({ path: "README.md", additions: 12, deletions: 2 }),
    ]);
    assert.equal(inferType(diff), "feat");
  });

  it("does not treat a README that mentions fix as a bugfix when code also ships", () => {
    const diff = stagedDiff(
      [
        stagedFile({ path: "src/cli.ts", status: statuses.add, additions: 30, deletions: 0 }),
        stagedFile({ path: "README.md", additions: 20, deletions: 0 }),
      ],
      [
        addedLines("README.md", "- `fix` / `bug` / `crash` in the diff → `fix`"),
        addedLines("src/cli.ts", "export function main() {}"),
      ],
    );
    assert.equal(inferType(diff), "feat");
  });
});

describe("inferScope", () => {
  it("uses a shared directory under src", () => {
    assert.equal(
      inferScope([
        stagedFile({ path: "src/auth/login.ts" }),
        stagedFile({ path: "src/auth/session.ts" }),
      ]),
      "auth",
    );
  });

  it("uses the module name for a single src file", () => {
    assert.equal(inferScope([stagedFile({ path: "src/auth.ts" })]), "auth");
  });

  it("uses the package name in a workspace", () => {
    assert.equal(
      inferScope([stagedFile({ path: "packages/cli/src/main.ts" })]),
      "cli",
    );
  });

  it("omits scope when files are scattered", () => {
    assert.equal(
      inferScope([
        stagedFile({ path: "src/auth/a.ts" }),
        stagedFile({ path: "src/git/b.ts" }),
        stagedFile({ path: "src/ui/c.ts" }),
      ]),
      undefined,
    );
  });
});

describe("inferSubject", () => {
  it("uses added identifiers for new APIs", () => {
    const diff = stagedDiff(
      [stagedFile({ path: "src/auth.ts", status: statuses.add })],
      [addedLines("src/auth.ts", "export function refreshToken() {}")],
    );
    assert.equal(inferSubject(diff, "feat", "auth"), "add refresh token");
  });

  it("describes a single added file", () => {
    const diff = stagedDiff([
      stagedFile({ path: "src/heuristic.ts", status: statuses.add, deletions: 0 }),
    ]);
    assert.equal(inferSubject(diff, "feat"), "add heuristic");
  });

  it("describes a rename", () => {
    const diff = stagedDiff([
      stagedFile({
        path: "src/parse-args.ts",
        fromPath: "src/args.ts",
        status: statuses.rename,
      }),
    ]);
    assert.equal(
      inferSubject(diff, "refactor"),
      "rename args to parse args",
    );
  });

  it("uses update readme for documentation", () => {
    const diff = stagedDiff([stagedFile({ path: "README.md" })]);
    assert.equal(inferSubject(diff, "docs"), "update readme");
  });
});

describe("proposeHeuristic", () => {
  it("summarizes a brand-new multi-file tree without overfit identifiers", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff([
        stagedFile({ path: "src/a.ts", status: statuses.add, deletions: 0 }),
        stagedFile({ path: "src/b.ts", status: statuses.add, deletions: 0 }),
        stagedFile({ path: "src/c.ts", status: statuses.add, deletions: 0 }),
        stagedFile({ path: "README.md", status: statuses.add, deletions: 0 }),
      ]),
      vibe: "pro",
    });
    assert.equal(proposal.type, "feat");
    assert.equal(proposal.subject, "add initial implementation");
  });

  it("returns a conventional commit for a typical feature", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff(
        [
          stagedFile({
            path: "src/auth/login.ts",
            status: statuses.add,
            additions: 40,
            deletions: 0,
          }),
        ],
        [addedLines("src/auth/login.ts", "export function login() {}")],
      ),
      vibe: "pro",
    });
    const formatted = formatCommit(proposal);
    assert.match(formatted, /^feat\(auth\): /);
    assert.equal(proposal.engine, "heuristic");
    assert.equal(proposal.body, undefined);
  });

  it("marks breaking from an added conventional footer", () => {
    const noisy = proposeHeuristic({
      diff: stagedDiff(
        [stagedFile({ path: "src/format.ts" })],
        [
          addedLines(
            "src/format.ts",
            'const hint = "BREAKING CHANGE in docs";\nexport function formatCommit() {}',
          ),
        ],
      ),
      vibe: "pro",
    });
    assert.equal(noisy.breaking, false);

    const footer = proposeHeuristic({
      diff: stagedDiff(
        [stagedFile({ path: "CHANGELOG.md" })],
        [addedLines("CHANGELOG.md", "BREAKING CHANGE: drop Node 16")],
      ),
      vibe: "pro",
    });
    assert.equal(footer.breaking, true);
    assert.match(footer.body ?? "", /BREAKING CHANGE: drop Node 16/);
    assert.match(formatCommit(footer), /^docs!?:|^docs\(/);
    assert.match(formatCommit(footer), /!/);
  });

  it("marks breaking when a public export is deleted", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff(
        [stagedFile({ path: "src/api.ts", deletions: 4, additions: 0 })],
        [deletedLines("src/api.ts", "export function legacyLogin() {}")],
      ),
      vibe: "pro",
    });
    assert.equal(proposal.breaking, true);
    assert.match(proposal.body ?? "", /BREAKING CHANGE: remove public export legacyLogin/);
    assert.match(formatCommit(proposal), /!/);
  });

  it("marks breaking on package.json major version bump", () => {
    const major = proposeHeuristic({
      diff: stagedDiff(
        [stagedFile({ path: "package.json" })],
        [
          mixedHunk(
            "package.json",
            '  "version": "0.9.0",',
            '  "version": "1.0.0",',
          ),
        ],
      ),
      vibe: "pro",
    });
    assert.equal(major.breaking, true);
    assert.match(major.body ?? "", /BREAKING CHANGE: bump major version to 1\.0\.0/);

    const patch = proposeHeuristic({
      diff: stagedDiff(
        [stagedFile({ path: "package.json" })],
        [
          mixedHunk(
            "package.json",
            '  "version": "1.0.0",',
            '  "version": "1.0.1",',
          ),
        ],
      ),
      vibe: "pro",
    });
    assert.equal(patch.breaking, false);
  });

  it("honors breaking override and keeps footer in terse vibe", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff([stagedFile({ path: "src/auth.ts" })]),
      vibe: "terse",
      breaking: true,
    });
    assert.equal(proposal.breaking, true);
    assert.match(proposal.body ?? "", /^BREAKING CHANGE:/);
    assert.match(formatCommit(proposal), /!/);
  });

  it("honors type and scope overrides", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff([stagedFile({ path: "README.md" })]),
      type: "chore",
      scope: "release",
      vibe: "pro",
    });
    assert.equal(formatCommit(proposal), "chore(release): update readme");
  });

  it("adds a file list body for larger changes in pro vibe", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff([
        stagedFile({ path: "src/a.ts" }),
        stagedFile({ path: "src/b.ts" }),
        stagedFile({ path: "src/c.ts" }),
      ]),
      vibe: "pro",
    });
    assert.match(proposal.body ?? "", /Changed files:|Touches:/);
  });

  it("drops the body in terse vibe", () => {
    const proposal = proposeHeuristic({
      diff: stagedDiff([
        stagedFile({ path: "src/a.ts" }),
        stagedFile({ path: "src/b.ts" }),
        stagedFile({ path: "src/c.ts" }),
      ]),
      vibe: "terse",
    });
    assert.equal(proposal.body, undefined);
  });
});


describe("inferBreaking", () => {
  it("detects deleted export { } and export default", () => {
    assert.equal(
      inferBreaking(
        stagedDiff(
          [stagedFile({ path: "src/index.ts" })],
          [deletedLines("src/index.ts", "export { helper }")],
        ),
      ),
      true,
    );
    assert.equal(
      inferBreaking(
        stagedDiff(
          [stagedFile({ path: "src/main.ts" })],
          [deletedLines("src/main.ts", "export default App")],
        ),
      ),
      true,
    );
  });

  it("ignores non-export deletions", () => {
    assert.equal(
      inferBreaking(
        stagedDiff(
          [stagedFile({ path: "src/util.ts" })],
          [deletedLines("src/util.ts", "function helper() {}")],
        ),
      ),
      false,
    );
  });
});

describe("ensureBreakingFooter", () => {
  it("is a no-op when not breaking", () => {
    const message = {
      type: "feat" as const,
      subject: "add x",
      breaking: false,
      engine: "heuristic" as const,
    };
    assert.equal(ensureBreakingFooter(message), message);
  });

  it("does not duplicate an existing footer", () => {
    const message = {
      type: "feat" as const,
      subject: "add x",
      body: "BREAKING CHANGE: already here",
      breaking: true,
      engine: "heuristic" as const,
    };
    assert.equal(ensureBreakingFooter(message).body, message.body);
  });
});

describe("stem", () => {
  it("humanizes PascalCase and index files", () => {
    assert.equal(stem("src/AuthButton.tsx"), "auth button");
    assert.equal(stem("src/parser/index.ts"), "parser");
  });
});
