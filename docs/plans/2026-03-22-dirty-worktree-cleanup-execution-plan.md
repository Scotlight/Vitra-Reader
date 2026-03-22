# Dirty Worktree Cleanup Execution Plan

Goal: turn the remaining dirty worktree into one validated commit with no leftover transient residue.

Internal grade: L

Wave 1: classify dirty files into source fixes, documentation migrations, and transient runtime artifacts.
Wave 2: keep or remove files based on canonical location and current code relevance.
Wave 3: run focused verification for changed source behavior and repository build health.
Wave 4: commit the reconciled result and emit cleanup receipts.

Verification commands:
- `npm run test:run -- src/test/chapterPreprocessCore.test.ts src/test/mobiTextDecoding.test.ts src/test/pdfContentProvider.test.ts src/test/pdfPageRenderer.test.ts src/test/vitraPipeline.test.ts`
- `npm run build --silent`
- `git status --short`

Rollback rules:
- If a dirty change fails focused verification and lacks a clear fix in-scope, revert that file instead of forcing it into the commit.
- If an untracked artifact cannot be justified as canonical or proof-bearing, remove it before commit.

Cleanup expectations:
- Remove transient runtime/planning residue that is not needed after commit.
- Keep only current proof artifacts for this governed run.
