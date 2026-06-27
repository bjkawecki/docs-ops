# QA checklist – Edit-System v0.2.0

Manual verification before tagging `v0.2.0`.

## Suggestion workflow

- [ ] Author opens a published document, clicks **Suggest change** on a block, submits a suggestion.
- [ ] Lead sees the item under **Pending for review** on `/reviews` and in the dashboard widget.
- [ ] Lead accepts the suggestion in the document draft tab; content updates and `draftRevision` increments.
- [ ] Lead publishes; readers see the new published version.
- [ ] Pending suggestions from before publish are **superseded**.

## Stale revision

- [ ] Author submits with outdated `baseDraftRevision` after lead edited draft → **409 Conflict**, UI shows stale hint and refetches.

## Reviews inbox

- [ ] Lead queue lists only documents in contexts where the user can publish.
- [ ] **My suggestions** lists the author’s own pending items.
- [ ] Sidebar badge matches `totalPendingForReview`.

## Editor & blocks v1

- [ ] Lead editor: bold, italic, inline code persist after save/reload.
- [ ] Published preview renders formatted text correctly.

## PDF export

- [ ] Export PDF on a document with headings, lists, and inline marks completes and downloads.

## Live updates

- [ ] With SSE connected: no 15s polling on document/draft/suggestions/reviews (network tab).
- [ ] After disconnecting SSE: fallback polling resumes.

## Automated

- [ ] `pnpm run lint`
- [ ] Backend tests: `pnpm --filter backend test`
