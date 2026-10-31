import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  escapeHtml,
  formatHtml,
  THEME_TOKENS,
} from "../src/html.ts";
import {
  DEFAULT_HTML_THEME,
  HTML_THEMES,
  type HtmlTheme,
  type ProposedMessage,
} from "../src/types.ts";
import { stagedDiff, stagedFile } from "./helpers.ts";

const HOSTILE = `<img src=x onerror="alert(1)"> & studies show <script>alert("x")</script>`;
const CDN = /cdn\.|unpkg|jsdelivr|fonts\.googleapis|https?:\/\//i;

function sampleProposal(partial: Partial<ProposedMessage> = {}): ProposedMessage {
  return {
    type: "feat",
    scope: "auth",
    subject: "add logout",
    body: HOSTILE,
    breaking: false,
    engine: "heuristic",
    locale: "en",
    ...partial,
  };
}

function sampleDiff() {
  return stagedDiff([
    stagedFile({ path: "src/auth.ts", status: "M", additions: 8, deletions: 0 }),
  ]);
}

describe("escapeHtml / formatHtml", () => {
  it("escapes angle brackets amp quotes", () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script> &'`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;&#39;",
    );
  });

  it("emits a self-contained proposal report with expected markers", () => {
    const html = formatHtml(sampleDiff(), sampleProposal({ breaking: true }), {
      vibe: "playful",
    });
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /vibe-commit/);
    assert.match(html, /feat\(auth\)!: add logout/);
    assert.match(html, /playful/);
    assert.match(html, /heuristic/);
    assert.match(html, /src\/auth\.ts/);
    assert.match(html, /\+8/);
    assert.match(html, /breaking/i);
    assert.match(html, /<style>/);
    assert.doesNotMatch(html, CDN);
    assert.doesNotMatch(html, /<script[\s>]/i);
    assert.doesNotMatch(html, /<link\s/i);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
    assert.match(html, /onerror=/);
    assert.doesNotMatch(html, /\sonerror="/i);
  });

  it("default theme matches ember CSS (0.1.27 look)", () => {
    const omitted = formatHtml(sampleDiff(), sampleProposal(), { vibe: "pro" });
    const ember = formatHtml(sampleDiff(), sampleProposal(), {
      vibe: "pro",
      theme: "ember",
    });
    assert.equal(omitted, ember);
    assert.match(omitted, /--bg: #1a1b26;/);
    assert.match(omitted, /border-color: #5a1d1d;/);
    assert.match(omitted, /color: #a9b1d6;/);
    assert.doesNotMatch(omitted, /var\(--hot-border\)/);
    assert.doesNotMatch(omitted, /var\(--text-soft\)/);
  });

  it("each HTML theme has a distinct palette", () => {
    const css: Record<HtmlTheme, string> = {
      ember: formatHtml(sampleDiff(), sampleProposal(), { theme: "ember" }),
      fog: formatHtml(sampleDiff(), sampleProposal(), { theme: "fog" }),
      midnight: formatHtml(sampleDiff(), sampleProposal(), { theme: "midnight" }),
      paper: formatHtml(sampleDiff(), sampleProposal(), { theme: "paper" }),
    };
    const bgs = HTML_THEMES.map((name) => THEME_TOKENS[name]["--bg"]);
    assert.equal(new Set(bgs).size, HTML_THEMES.length);
    assert.equal(DEFAULT_HTML_THEME, "ember");
    for (const name of HTML_THEMES) {
      assert.match(css[name], new RegExp(`--bg: ${THEME_TOKENS[name]["--bg"]};`));
      assert.doesNotMatch(css[name], CDN);
      assert.doesNotMatch(css[name], /<script[\s>]/i);
      assert.doesNotMatch(css[name], /<link\s/i);
    }
    assert.match(css.fog, /var\(--text-soft\)/);
    assert.match(css.midnight, /var\(--hot-border\)/);
    assert.match(css.paper, /var\(--ok-border\)/);
    assert.notEqual(css.ember, css.fog);
    assert.notEqual(css.ember, css.midnight);
    assert.notEqual(css.ember, css.paper);
    assert.notEqual(css.fog, css.midnight);
    assert.notEqual(css.fog, css.paper);
    assert.notEqual(css.midnight, css.paper);
  });

  it("uses zh labels when locale is zh", () => {
    const html = formatHtml(
      sampleDiff(),
      sampleProposal({ locale: "zh", body: "添加登出" }),
      { vibe: "pro" },
    );
    assert.match(html, /lang="zh"/);
    assert.match(html, /提案/);
    assert.match(html, /信号/);
    assert.match(html, /提示/);
  });
});

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.ts");
const tsxBin = join(root, "node_modules", ".bin", "tsx");

function run(
  cwd: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      VIBE_COMMIT_VIBE: "pro",
      NO_COLOR: "1",
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vibe-commit-html-"));
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "vibe@test.local"]);
  git(cwd, ["config", "user.name", "Vibe Tester"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(
    join(cwd, "src", "auth.ts"),
    "export function login() {\n  return true;\n}\n",
  );
  git(cwd, ["add", "src/auth.ts"]);
  return cwd;
}

const repos: string[] = [];

after(() => {
  for (const cwd of repos) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe("--html CLI", () => {
  it("lists --html in help", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--html \[path\]/);
    assert.match(help.stdout, /Self-contained HTML report/);
    assert.match(help.stdout, /--html and --json cannot share stdout/);
    assert.match(help.stdout, /--theme <name>/);
    assert.match(help.stdout, /ember \(default\)/);
    assert.match(help.stdout, /fog/);
    assert.match(help.stdout, /midnight/);
    assert.match(help.stdout, /paper/);
  });

  it("defaults to ember CSS and accepts --theme ember", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const omitted = run(cwd, ["--no-ai", "--html"]);
    const ember = run(cwd, ["--no-ai", "--html", "--theme", "ember"]);
    assert.equal(omitted.status, 0, omitted.stderr);
    assert.equal(ember.status, 0, ember.stderr);
    assert.equal(omitted.stdout, ember.stdout);
    assert.match(omitted.stdout, /--bg: #1a1b26;/);
  });

  it("applies each --theme palette on stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const seen = new Set<string>();
    for (const name of HTML_THEMES) {
      const result = run(cwd, ["--no-ai", "--html", "--theme", name]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<!DOCTYPE html>/i);
      assert.match(
        result.stdout,
        new RegExp(`--bg: ${THEME_TOKENS[name]["--bg"]};`),
      );
      assert.doesNotMatch(result.stdout, CDN);
      seen.add(THEME_TOKENS[name]["--bg"]!);
    }
    assert.equal(seen.size, HTML_THEMES.length);
  });

  it("rejects an invalid --theme with UsageError", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html", "--theme", "solar"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid --theme/);
    assert.match(result.stderr, /ember, fog, midnight, paper/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps --theme with --fail-above, --github, and --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--html",
      "--theme",
      "fog",
      "--github",
      "--quiet",
      "--fail-above",
      "100",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.match(result.stdout, /--bg: #e8eef4;/);
    assert.match(result.stderr, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /next {2}vibe-commit --commit/);
    assert.doesNotMatch(result.stderr, /exceeds --fail-above/);
  });

  it("still gates after themed HTML when --fail-above is exceeded", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--html",
      "--theme",
      "paper",
      "--quiet",
      "--fail-above",
      "40",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.match(result.stdout, /--bg: #f6f0e4;/);
    assert.match(result.stderr, /risk score 45 exceeds --fail-above 40/);
  });

  it("prints HTML to stdout when path is omitted", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.match(result.stdout, /vibe-commit/);
    assert.match(result.stdout, /feat\(auth\): /);
    assert.match(result.stdout, /<style>/);
    assert.doesNotMatch(result.stdout, CDN);
    assert.doesNotMatch(result.stdout, /<script[\s>]/i);
    assert.doesNotMatch(result.stdout, /next {2}vibe-commit --commit/);
  });

  it("writes HTML to path and does not dump it to stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "nested", "report.html");
    const result = run(cwd, ["--no-ai", "--html", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /wrote html report to/);
    assert.match(result.stderr, /report\.html/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.equal(existsSync(outFile), true);
    const content = readFileSync(outFile, "utf8");
    assert.match(content, /<!DOCTYPE html>/i);
    assert.match(content, /vibe-commit/);
    assert.match(content, /feat\(auth\): /);
    assert.doesNotMatch(content, CDN);
    assert.doesNotMatch(content, /<script[\s>]/i);
  });

  it("rejects --html together with --json", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html", "--json"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot be combined with --json/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps default pretty stdout when --html is absent", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /feat\(auth\): /);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps --json stdout unchanged when --html is absent", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      formatted: string;
      engine: string;
      locale: string;
    };
    assert.equal(parsed.engine, "heuristic");
    assert.equal(parsed.locale, "en");
    assert.match(parsed.formatted, /^(feat|fix|docs|chore|refactor)\b/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("suppresses pretty report with --html --quiet (HTML still on stdout)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--quiet", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(result.stdout, /next {2}vibe-commit --commit/);
    assert.doesNotMatch(result.stderr, /proposed/);
  });

  it("keeps --github annotations with --html (annotations on stderr)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--github", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(result.stdout, /::(error|warning|notice) /);
    assert.match(result.stderr, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::group::/);
  });

  it("keeps --github annotations + STEP_SUMMARY with --html path", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const dir = mkdtempSync(join(tmpdir(), "vibe-commit-html-gh-"));
    repos.push(dir);
    const htmlFile = join(dir, "proposal.html");
    const sumFile = join(dir, "step_summary.md");
    const outFile = join(dir, "github_output");
    const result = run(cwd, ["--no-ai", "--github", "--html", htmlFile], {
      GITHUB_STEP_SUMMARY: sumFile,
      GITHUB_OUTPUT: outFile,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.match(readFileSync(htmlFile, "utf8"), /<!DOCTYPE html>/i);
    assert.match(readFileSync(sumFile, "utf8"), /## vibe-commit/);
    assert.match(readFileSync(outFile, "utf8"), /^title=/m);
  });

  it("suppresses pretty group with --html path --github --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const htmlFile = join(cwd, "proposal.html");
    const result = run(cwd, [
      "--no-ai",
      "--github",
      "--quiet",
      "--html",
      htmlFile,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::group::/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.equal(result.stderr.includes("wrote html report to"), false);
    assert.match(readFileSync(htmlFile, "utf8"), /vibe-commit/);
  });

  it("writes pretty to --out and HTML to stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.txt");
    const result = run(cwd, ["--no-ai", "--html", "--out", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    const file = readFileSync(outFile, "utf8");
    assert.match(file, /feat\(auth\): /);
    assert.doesNotMatch(file, /<!DOCTYPE html>/i);
  });
});
