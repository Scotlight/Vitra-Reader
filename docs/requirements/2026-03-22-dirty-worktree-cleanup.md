# Dirty Worktree Cleanup Requirement

Goal: reconcile the remaining dirty worktree into one clean, reviewable state, preserving real feature/fix work and removing or relocating stale artifacts.

Constraints:
- Do not rewrite or reopen the already-pushed `pdfPageRenderer.ts` change set.
- Preserve legitimate in-progress fixes for large-chapter payload duplication, MOBI decoding, reader persistence pressure, and PDF compatibility glue.
- Only delete artifacts when they are clearly transient, superseded, or duplicated elsewhere.
- End with a clean `git status` after verification and commit.

Acceptance Criteria:
- Purposeful dirty source changes are either committed or explicitly reverted with evidence.
- Stale root-level or runtime artifacts are cleaned up or relocated to their canonical home.
- Focused verification passes for the touched behaviors.
- The worktree is clean after the commit.

Non-Goals:
- New feature work unrelated to the current dirty files.
- Re-opening the pushed console-cleanup commit.
- Broad refactors outside the dirty worktree scope.
