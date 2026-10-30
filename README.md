# vibe-commit

<p align="center">
  <a href="https://github.com/webywz/vibe-commit/actions/workflows/ci.yml"><img src="https://github.com/webywz/vibe-commit/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@webywz/vibe-commit"><img src="https://img.shields.io/npm/v/@webywz/vibe-commit.svg" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
</p>

<p align="center">
  <strong>Stylish conventional commits. Offline-first. AI-optional.</strong><br/>
  Stage your files, run one command, get a commit message that looks like you meant it.
</p>

<p align="center">
  有品味的 Conventional Commits。离线优先，AI 可选。<br/>
  暂存改动，一条命令，写出像你认真写过的提交信息。
</p>

Companion spirit to [diff-vibe](https://github.com/webywz/diff-vibe): commits here, pull requests there.
Pair walkthrough (EN/中文), helper script, and CI sample: [`examples/pair-workflow.md`](./examples/pair-workflow.md) · [`examples/commit-msg.sh`](./examples/commit-msg.sh) · [`examples/github-actions.yml`](./examples/github-actions.yml) (ship in the npm tarball).

与 [diff-vibe](https://github.com/webywz/diff-vibe) 成对：这边写 commit，那边写 PR。
成对流程与可复制脚本见 [`examples/`](./examples/)（随 npm 包发布）。

---

## Install · 安装

```bash
npm i -g @webywz/vibe-commit
npx @webywz/vibe-commit
```

Requires **Node.js 18.18+** and `git`. Package: [`@webywz/vibe-commit`](https://www.npmjs.com/package/@webywz/vibe-commit). Binary: `vibe-commit`.

需要 **Node.js 18.18+** 与 `git`。包名 `@webywz/vibe-commit`，命令仍是 `vibe-commit`。

---

## Quick start · 快速开始

```bash
git add -p
vibe-commit                         # propose from staged diff
vibe-commit --vibe playful --commit # write the commit
vibe-commit --breaking --dry-run    # force ! + BREAKING CHANGE footer
vibe-commit --dry-run               # print only (default; wins over --commit)
vibe-commit --github --quiet --no-ai  # Actions annotations (CI)
git commit -m "$(vibe-commit --dry-run)"
vibe-commit init                    # auto-detect hook manager and install
vibe-commit init --force            # force overwrite existing hook/config
vibe-commit install                 # install bare .git/hooks (legacy)
```

| Flag / command | What it does · 作用 |
| --- | --- |
| `--commit` | Run `git commit` with the proposed message · 用生成信息执行提交 |
| `--dry-run` | Print only; never commit (default) · 只打印，不提交（默认） |
| `--type <type>` | Force `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` |
| `--scope <scope>` | Override inferred scope · 覆盖推断出的 scope |
| `--vibe <style>` | `playful` \| `pro` \| `terse` (default: `pro`) |
| `--locale <locale>` | `en` \| `zh` (default: `en`) · 提交信息主题语言 |
| `--no-ai` | Skip the API even if `OPENAI_API_KEY` is set · 即使有 Key 也不走 AI |
| `--breaking` | Force breaking (`!` + `BREAKING CHANGE:` footer = **subject**) · 强制破坏性变更（`!` + footer 文本即 **subject**） |
| `--json` | Machine-readable proposal (propose) or result (init) · 机器可读提案（propose）或结果（init） |
| `--github` | Emit GitHub Actions `::notice` / `::warning` / `::error` annotations; write `GITHUB_OUTPUT` + `GITHUB_STEP_SUMMARY` when set · 输出 Actions 注解，并在环境变量存在时写 Job 输出与 Summary |
| `--quiet` | Suppress the pretty terminal report; `--json` / `--github` still emit · 抑制漂亮终端报告 |
| `--max-annotations <n>` | Cap `--github` annotation lines (default: 20; invalid → UsageError) · 限制注解条数 |
| `init [--path] [--force] [--json]` | Auto-detect hook manager and install (husky → simple-git-hooks → bare .git/hooks) · 自动检测钩子管理器并安装 |
| `install [--path]` | Install the prepare-commit-msg hook (bare .git/hooks) · 安装钩子（直接写 .git/hooks） |
| `uninstall [--path]` | Remove the managed hook · 卸载钩子 |
| `--force` | Force overwrite existing hook/config (init only) · 强制覆盖已存在的钩子配置（仅 init） |
| `-h` / `-v` | Help / version · 帮助 / 版本 |

Offline heuristic also marks breaking when the staged diff removes public `export`s or bumps a `package.json` major version, and always attaches a `BREAKING CHANGE:` footer when `breaking` is true (so `--json` body matches the formatted message). Forced `--breaking` puts the **subject** in the footer; heuristic breaking still prefers a more specific bilingual reason when one is available. Dry-run prints a one-line cause; `--json` may include `breakingReason`.

离线启发式在删掉公开 `export`、或 `package.json` 主版本升级时也会标 breaking；只要 `breaking` 为真就会补上 `BREAKING CHANGE:` footer（`--json` 的 body 与格式化输出一致）。强制 `--breaking` 时 footer 文本即 **subject**；启发式推断 breaking 时仍可用更具体的双语原因。干跑会打一行原因；`--json` 可带 `breakingReason`。

### Pair with diff-vibe · 与 diff-vibe 成对

```bash
git add -p
npx --yes @webywz/vibe-commit --commit
npx --yes @webywz/diff-vibe@^0.1.8 --base main --create
```

Commits here · PRs there. Full walkthrough (EN/中文), `commit-msg.sh`, and Actions sample live in [`examples/`](./examples/). Companion-side snippets: [diff-vibe examples](https://github.com/webywz/diff-vibe/tree/main/examples).

这边写 commit，那边写 PR。完整成对流程与脚本见 [`examples/`](./examples/)。成对仓库示例：[diff-vibe examples](https://github.com/webywz/diff-vibe/tree/main/examples)。

**Vibes** · 语气

- **pro** — default. Imperative, review-ready. · 默认：祈使句，可进 review。
- **terse** — headline only, filler gone. · 只留标题，去掉废话。
- **playful** — a little personality, still safe for a real repo. · 带一点性格，但仍适合正经仓库。

```text
$ vibe-commit

  vibe-commit  ·  heuristic  ·  feat

  1 file  ·  +124  −8

  proposed

    feat(heuristic): infer conventional commit type from staged diffs

  next  vibe-commit --commit
```

### Git hook · 钩子

```bash
vibe-commit init                         # auto-detect and install
vibe-commit init --force                 # overwrite existing hook/config
vibe-commit init --json                  # machine-readable output
vibe-commit init --path ~/projects/app
vibe-commit install                      # bare .git/hooks only (legacy)
vibe-commit install --path ~/projects/app
vibe-commit uninstall
```

With `--json`, `init` prints only JSON to stdout:

```json
{
  "manager": "husky",
  "targetPath": "/path/to/.husky/prepare-commit-msg",
  "created": true,
  "updated": false,
  "backedUp": false
}
```

**`init` auto-detects your hook manager** in this order:

1. **husky** — if `package.json` has a `husky` dependency or `.husky/` directory exists
   - Writes `.husky/prepare-commit-msg`
2. **simple-git-hooks** — if `package.json` has `simple-git-hooks` dependency or config
   - Sets `simple-git-hooks.prepare-commit-msg` in `package.json`
   - After `init`, run `npx simple-git-hooks` to install
3. **bare .git/hooks** — fallback
   - Writes `.git/hooks/prepare-commit-msg` directly

**`init` 自动检测钩子管理器**，顺序如下：

1. **husky** — `package.json` 有 `husky` 依赖或存在 `.husky/` 目录
   - 写入 `.husky/prepare-commit-msg`
2. **simple-git-hooks** — `package.json` 有 `simple-git-hooks` 依赖或配置
   - 在 `package.json` 中设置 `simple-git-hooks.prepare-commit-msg`
   - `init` 后需运行 `npx simple-git-hooks` 来安装
3. **bare .git/hooks** — 兜底
   - 直接写入 `.git/hooks/prepare-commit-msg`

After `init` or `install`, plain `git commit` (no `-m`) fills an empty or comment-only message file with a conventional proposal.

`init` 或 `install` 后，裸 `git commit`（没有 `-m`）会在空 / 仅注释的提交说明里填入提案。

| Situation · 情况 | Behavior · 行为 |
| --- | --- |
| Source is `merge`, `squash`, or `commit` (amend) | Leave the message alone · 不改 |
| Message already has non-comment text (e.g. `git commit -m`) | Never overwrite · 绝不覆盖 |
| No staged changes / generator error | Exit 0 — never break the commit · 以 0 退出，不打断提交 |
| Hook/config already exists (not managed) | `init` refuses without `--force` · `init` 拒绝（除非 `--force`） |

**Conflict behavior · 冲突行为**

- If `init` finds a hook or config entry that already exists and is **not** managed by vibe-commit (no `# BEGIN VIBE-COMMIT` markers or different command), it **refuses** with exit 1 and shows a bilingual error unless `--force` is passed.
- With `--force`, existing hooks are backed up as `prepare-commit-msg.vibe-backup` and chained after ours (like `install` does).
- Managed blocks (already installed by vibe-commit) are updated in place without `--force`.

**如果 `init` 发现已有钩子或配置且不由 vibe-commit 管理**（没有 `# BEGIN VIBE-COMMIT` 标记或不同命令），会以退出码 1 拒绝并显示双语错误信息，除非传递了 `--force`。

**使用 `--force` 时**，现有钩子会备份为 `prepare-commit-msg.vibe-backup` 并链式调用（与 `install` 一样）。

**已管理的代码块**（已由 vibe-commit 安装）会就地更新，无需 `--force`。

Hook stays **offline by default** (`VIBE_COMMIT_HOOK_AI=1` to allow AI). Unique markers (`# BEGIN VIBE-COMMIT` … `# END VIBE-COMMIT`) keep uninstall clean. A foreign `prepare-commit-msg` is backed up to `prepare-commit-msg.vibe-backup` and chained after ours.

钩子默认离线；设 `VIBE_COMMIT_HOOK_AI=1` 才允许 AI。用标记块保证干净卸载。已有外来钩子会备份并链式调用。

### Locale support · 语言支持

vibe-commit supports English (`en`, default) and Chinese (`zh`) commit subjects:

vibe-commit 支持英文（`en`，默认）和中文（`zh`）提交信息主题：

```bash
vibe-commit --locale zh --dry-run        # Chinese subject: 添加/修复/更新...
vibe-commit --locale en --dry-run        # English subject: add/fix/update...
```

**Configuration precedence** · 配置优先级：
1. CLI flag `--locale`
2. Environment variable `VIBE_COMMIT_LOCALE`
3. Project config (`.vibe-commit.json` or `package.json#vibeCommit`)
4. Default `en`

```json
// .vibe-commit.json
{
  "locale": "zh",
  "vibe": "pro"
}
```

```json
// package.json
{
  "vibeCommit": {
    "locale": "zh",
    "vibe": "terse"
  }
}
```

Both heuristic and AI engines respect the locale setting. The `--json` output includes a `locale` field.

启发式引擎和 AI 引擎都会遵循 locale 设置。`--json` 输出包含 `locale` 字段。

### AI (optional) · AI（可选）

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini          # optional
export OPENAI_BASE_URL=https://api.openai.com/v1
export VIBE_COMMIT_VIBE=pro              # or VIBE
export VIBE_COMMIT_LOCALE=zh             # or en (default)
```

OpenAI-compatible Chat Completions. Missing key, timeout, or 4xx/5xx → silent fallback to the offline heuristic. See [`.env.example`](.env.example). Unstaged files are never sent; huge diffs are truncated.

兼容 OpenAI Chat Completions。没 Key、超时或 4xx/5xx → 静默回退离线启发式。可参考 `.env.example`。不会上传未暂存文件；过大 diff 会截断。

### Library · 库

```ts
import { proposeHeuristic, formatCommit } from "@webywz/vibe-commit";

const message = proposeHeuristic({ diff, vibe: "pro" });
console.log(formatCommit(message));
// feat(auth): add login
```

---

## Features · 特性

1. Reads **staged** changes only (`git diff --cached`). Unstaged noise is ignored.
   只读 **已暂存** 改动；忽略未暂存噪音。
2. **Offline heuristic** always on: paths + hunk keywords + added identifiers → `type`, `scope`, `subject`.
   **离线启发式**始终开启：路径 + hunk 关键词 + 新增标识 → `type` / `scope` / `subject`。
   - `README` / `docs/` → `docs`
   - `*.test.ts` / `test/` → `test`
   - `.github/workflows` → `ci`
   - lockfiles / `package.json` → `chore`
   - `fix` / `bug` / `crash` in the diff → `fix`
   - new files / `export function` → `feat`
3. Optional AI draft with automatic heuristic fallback.
   可选 AI 草稿，失败自动回退启发式。
4. **Breaking** when the diff removes a public `export`, bumps a `package.json` major, already has a `BREAKING CHANGE:` footer, or you pass `--breaking`. Forced `--breaking` puts the **subject** in the footer; heuristic cases keep a more specific bilingual reason when available. Dry-run shows why; `--json` may include `breakingReason`.
   **破坏性变更**：删公开 `export`、主版本升级、diff 里已有 footer，或传 `--breaking`。强制 `--breaking` 时 footer 用 **subject**；启发式仍可用更具体的双语原因。干跑说明原因；`--json` 可带 `breakingReason`。
5. Managed `prepare-commit-msg` hook via `install` / `uninstall`.
   通过 `install` / `uninstall` 管理 `prepare-commit-msg` 钩子。
6. **GitHub Actions** mode: `--github` emits Checks annotations; optional `--quiet` / `--max-annotations`; writes job outputs + step summary when `GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY` are set. See [`examples/github-actions.yml`](./examples/github-actions.yml).
   **GitHub Actions** 模式：`--github` 输出 Checks 注解；可选 `--quiet` / `--max-annotations`；环境变量存在时写 Job 输出与 Summary。示例见 [`examples/github-actions.yml`](./examples/github-actions.yml)。

---

## Links · 链接

- npm · [`@webywz/vibe-commit`](https://www.npmjs.com/package/@webywz/vibe-commit)
- Source · [github.com/webywz/vibe-commit](https://github.com/webywz/vibe-commit)
- Related · [diff-vibe](https://github.com/webywz/diff-vibe) · [prompt-diff](https://github.com/webywz/prompt-diff)
- Pair workflow · [examples/pair-workflow.md](./examples/pair-workflow.md)
- GitHub Actions · [examples/github-actions.yml](./examples/github-actions.yml)
- License · [MIT](./LICENSE)

```bash
npm install && npm test && npm run build
node dist/cli.js --help
```
