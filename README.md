# vibe-commit

**Stylish conventional commits. Offline-first. AI-optional.**

Stage your files, run one command, get a commit message that looks like you meant it.

一条命令，根据暂存区 diff 写出有品味的 [Conventional Commits](https://www.conventionalcommits.org/)。**无 API Key 也能用**，有 Key 时再可选 AI。

[![CI](https://github.com/webywz/vibe-commit/actions/workflows/ci.yml/badge.svg)](https://github.com/webywz/vibe-commit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@webywz/vibe-commit.svg)](https://www.npmjs.com/package/@webywz/vibe-commit)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## Demo

```text
$ git add src/heuristic.ts
$ vibe-commit

  vibe-commit  ·  heuristic  ·  feat

  1 file  ·  +124  −8

    M  src/heuristic.ts  +124 −8

  proposed

    feat(heuristic): infer conventional commit type from staged diffs

  next  vibe-commit --commit
```

```text
$ vibe-commit --vibe playful --commit
    feat(cli): ship offline heuristic commit messages — quietly useful
  committed
```

Pipe-friendly when stdout is not a TTY:

```bash
git commit -m "$(vibe-commit --dry-run)"
```

---

## Install · 安装

```bash
npm install -g @webywz/vibe-commit
# or, no install:
npx @webywz/vibe-commit
```

Requires **Node.js 18.18+** and `git`. After install, the CLI binary is still `vibe-commit`.

```bash
npm i -g @webywz/vibe-commit          # 全局安装
npx @webywz/vibe-commit               # 一次性运行
```

---

## Usage · 用法

```bash
git add -p          # stage the work you actually want to commit
vibe-commit         # inspect the staged diff, print a proposal
vibe-commit --commit
```

| Flag | What it does · 作用 |
| --- | --- |
| `--commit` | Run `git commit` with the proposed message · 用生成的信息执行提交 |
| `--dry-run` | Print only; never commit (default, and wins over `--commit`) |
| `--type <type>` | Force `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` |
| `--scope <scope>` | Override inferred scope · 覆盖推断出的 scope |
| `--vibe <style>` | `playful` \| `pro` \| `terse` (default: `pro`) |
| `--no-ai` | Skip the API even if `OPENAI_API_KEY` is set |
| `--json` | Machine-readable proposal |
| `-h`, `--help` | Help |
| `-v`, `--version` | Version |

### Vibes

- **pro** — default. Imperative, review-ready, conventional.
- **terse** — headline only, filler words gone.
- **playful** — a little personality, still safe for a real repo.

默认 **pro**：专业、祈使句、可直接进 code review。`terse` 更短；`playful` 带一点俏皮，但不会变成段子。

---

## How it works · 原理

1. Read **staged** changes only (`git diff --cached`). Unstaged noise is ignored.
2. **Offline heuristic** (always on): file paths + hunk keywords + added identifiers → `type`, `scope`, `subject`.
   - `README` / `docs/` → `docs`
   - `*.test.ts` / `test/` → `test`
   - `.github/workflows` → `ci`
   - lockfiles / `package.json` → `chore`
   - `fix` / `bug` / `crash` in the diff → `fix`
   - new files / `export function` → `feat`
3. If `OPENAI_API_KEY` is set, ask an OpenAI-compatible model and **fall back to the heuristic** on any failure.
4. Print a proposal. With `--commit`, run `git commit` (headline + optional body as two `-m` flags — no shell interpolation).

只看 **已暂存** 的 diff。启发式始终可用；配置了 API Key 才走模型，失败自动回退。

---

## AI (optional)

```bash
export OPENAI_API_KEY=sk-...
# optional:
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_BASE_URL=https://api.openai.com/v1   # any compatible gateway
export VIBE_COMMIT_VIBE=pro
```

Copy `.env.example` if you keep secrets in a file. vibe-commit never sends unstaged files, and it truncates huge diffs.

兼容 OpenAI Chat Completions。没 Key、超时、4xx/5xx → 静默回退到离线启发式，CLI 仍然能给出一条能用的信息。

---

## Library

```ts
import { proposeHeuristic, formatCommit } from "@webywz/vibe-commit";

const message = proposeHeuristic({ diff, vibe: "pro" });
console.log(formatCommit(message));
// feat(auth): add login
```

---

## Develop · 开发

```bash
git clone https://github.com/webywz/vibe-commit
cd vibe-commit
npm install
npm test
npm run build
node dist/cli.js --help
```

| Script |  |
| --- | --- |
| `npm test` | Unit + e2e tests (`node:test` + `tsx`) |
| `npm run build` | Emit `dist/` |
| `npm run typecheck` | `tsc --noEmit` |

MIT © webywz — see [LICENSE](./LICENSE).
