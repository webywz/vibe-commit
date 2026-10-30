#!/usr/bin/env bash
# Copy-pasteable: stage interactively, then propose / write a commit with vibe-commit.
# 可复制：交互暂存后，用 vibe-commit 提案 / 真正提交。
#
# Pin: @webywz/vibe-commit  ·  Companion: @webywz/diff-vibe@^0.1.8
# Requires: Node.js 18.18+, git  ·  需要：Node 18.18+、git
#
# Typical pair flow · 成对流程：
#   ./examples/commit-msg.sh
#   npx --yes @webywz/diff-vibe@^0.1.8 --base main --create
#
# Preview only (default) · 只预览（默认）：
#   DRY_RUN=1 ./examples/commit-msg.sh
# Write the commit · 真正提交：
#   COMMIT=1 ./examples/commit-msg.sh
# Skip interactive add · 跳过交互暂存：
#   SKIP_ADD=1 COMMIT=1 ./examples/commit-msg.sh

set -euo pipefail

PKG="${PKG:-@webywz/vibe-commit}"

if [[ "${SKIP_ADD:-}" != "1" ]]; then
  # Interactive stage · 交互暂存
  git add -p
fi

if [[ "${COMMIT:-}" == "1" && "${DRY_RUN:-}" != "1" ]]; then
  # Write the commit · 真正提交
  npx --yes "$PKG" --commit
else
  # Print proposal only · 只打印提案
  npx --yes "$PKG" --dry-run
fi
