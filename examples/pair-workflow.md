# Pair workflow · 成对用法

`vibe-commit` writes the commit. `diff-vibe` drafts the PR.
Use them together on the same branch — offline by default, AI optional.

`vibe-commit` 写 commit，`diff-vibe` 写 PR。
同一分支上成对用；默认离线，有 Key 再可选 AI。

Pinned packages for this walkthrough · 本示例钉包版本：

- `@webywz/vibe-commit` (this package · 本包)
- `@webywz/diff-vibe@^0.1.8`

Requires **Node.js 18.18+**, `git`, and (for open/update) [`gh`](https://cli.github.com/).

需要 **Node.js 18.18+**、`git`；开/更新 PR 还需本机有 `gh`。

---

## 1. Commit · 提交

```bash
git add -p
npx --yes @webywz/vibe-commit --dry-run    # review the proposal · 先看提案
npx --yes @webywz/vibe-commit --commit     # write the commit · 真正提交
```

Or use the short binary / the copy-pasteable helper:

也可全局安装后用短命令，或跑 [`commit-msg.sh`](./commit-msg.sh)：

```bash
npm i -g @webywz/vibe-commit @webywz/diff-vibe@^0.1.8
vibe-commit --commit
# or · 或
./examples/commit-msg.sh
```

---

## 2. PR draft · PR 草稿

Diff against the PR base (usually `main`) so commits already on the branch are included.

对比 PR 基线（通常是 `main`），把分支上已提交的改动一并纳入：

```bash
npx --yes @webywz/diff-vibe@^0.1.8 --base main
npx --yes @webywz/diff-vibe@^0.1.8 --base main --copy   # clipboard when available · 能复制就复制
```

Pipe into `gh` without posting yet · 管道进 `gh`（尚未发帖）：

```bash
gh pr create \
  --title "$(npx --yes @webywz/diff-vibe@^0.1.8 --base main --title-only)" \
  --body-file <(npx --yes @webywz/diff-vibe@^0.1.8 --base main --body-only) \
  --dry-run
```

Full walkthrough on the companion side: [`diff-vibe` examples/pair-workflow.md](https://github.com/webywz/diff-vibe/blob/main/examples/pair-workflow.md).

成对仓库侧完整流程见 [diff-vibe `examples/pair-workflow.md`](https://github.com/webywz/diff-vibe/blob/main/examples/pair-workflow.md)。

---

## 3. Open or update · 开 PR / 更新

Opt-in flags shell out to `gh`. Nothing is posted without them.

需显式传参才会调 `gh`；不加则只打印草稿。

```bash
# open a new PR · 开新 PR
npx --yes @webywz/diff-vibe@^0.1.8 --base main --create

# draft PR · 草稿 PR
npx --yes @webywz/diff-vibe@^0.1.8 --base main --create --draft

# edit the open PR for this branch · 更新当前分支已开 PR
npx --yes @webywz/diff-vibe@^0.1.8 --base main --update
```

`--create` and `--update` are mutually exclusive. `--draft` only pairs with `--create`.

`--create` 与 `--update` 互斥；`--draft` 仅配合 `--create`。

---

## Mental model · 心智模型

| Step · 步骤 | Tool · 工具 | Input · 输入 |
| --- | --- | --- |
| Commit message | `vibe-commit` | **staged** diff (`git diff --cached`) |
| PR title + body | `diff-vibe` | staged + unstaged vs `HEAD`, or vs `--base` merge-base |

Commits here · PRs there. Same offline heuristic family; vibes and AI keys stay optional.

这边写 commit，那边写 PR。同一套离线启发式；文风与 AI Key 都可选。
