export { proposeWithAi } from "./ai.ts";
export { formatCommit, parseCommit, normalizeSubject } from "./format.ts";
export { inspectStaged, commitWithMessage, GitError } from "./git.ts";
export {
  proposeHeuristic,
  inferType,
  inferScope,
  inferSubject,
  inferBreaking,
  detectBreakingKind,
  formatBreakingReason,
  breakingFooterDetail,
  DEFAULT_BREAKING_FOOTER_DETAIL,
  ensureBreakingFooter,
  classifyPath,
} from "./heuristic.ts";
export type { BreakingKind } from "./heuristic.ts";
export { escapeHtml, formatHtml } from "./html.ts";
export type { HtmlFormatOptions } from "./html.ts";
export { parseArgs, helpText, UsageError } from "./parse-args.ts";
export {
  annotation,
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  escapeData,
  escapeProperty,
  formatGitHubAnnotations,
  formatGitHubStepSummary,
  proposalAnnotationType,
} from "./github.ts";
export { assembleDiff, parseUnifiedDiff } from "./parse-diff.ts";
export {
  installHook,
  uninstallHook,
  runPrepareCommitMsg,
  shouldSkipPrepareCommitMsg,
  hasNonCommentContent,
  HOOK_BEGIN,
  HOOK_END,
} from "./hook.ts";
export { proposeMessage } from "./propose.ts";
export { applyVibe } from "./vibe.ts";
export type {
  CliCommand,
  CliOptions,
  CommitType,
  ProposedMessage,
  ProposeOptions,
  StagedDiff,
  StagedFile,
  Vibe,
} from "./types.ts";
export { COMMIT_TYPES, VIBES } from "./types.ts";
