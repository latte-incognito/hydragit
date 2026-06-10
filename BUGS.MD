1. Scroll Bar inside activity rail next to branch pane, and isnisde branch pain should not widen on mouse over
2. inside the Main pane status bar i want to show, if brranch don't have upstream and haven't been pushed yet 
3. when brunch is unpablished. show the state inside main vew status bar, after branch name with ability to clikc and push it to remote
4. Ammend with sync on remote not ammending 3. when brunch is unpablished. show the state inside main vew status bar, after branch name with ability to clikc and push it to remote
5. after amennding commits, magic sync not working it's rebasing back
6. Dont foget mostly all of cloros should be from vscode -> status bar inside Hydragit is not  changing color properl

UI review 2026-06-09 (fix 7–9 before recording the marketplace GIF):

7. Detail pane shows raw ISO timestamp (`2026-06-07T04:45:33Z`) — humanize it like the log column
8. Date column truncates ("2026-06-0…") — switch to smart dates: time for today, `Jun 7` this year, `Jun 7, 2025` otherwise; frees column width for the message
9. Author column is pure repetition in single-author repos — collapse to avatar/initials chip, or auto-hide when only one author is in view
10. Ref pills eat the commit subject (`HEAD -> feature/fable_app…`) — render `HEAD ->` as an icon, middle-truncate long branch names, cap pills at N with a `+2` overflow chip
11. Selected log row uses an orange outline — reads as a focus ring and is off-palette; use `list.activeSelectionBackground` fill for selection, keep outline for keyboard focus only
12. Detail pane action row: add checkout-at-commit, create branch/tag from commit, and "View on GitHub" (openCommitUrl is already wired); visually separate Revert (destructive) from Copy hash
13. Search mode switching (msg → author/file/hash) — make the `msg` chip obviously clickable/cyclable or a dropdown
14. Dim author/date text contrast is borderline — use the `descriptionForeground` theme token instead of a hardcoded gray (same family as #6)

Sidebar (multi-repo) review 2026-06-09:

15. Clean repos render the full commit UI — empty Message box, Amend checkbox, branch pill, disabled Commit button (~400px of dead space per clean repo). Collapse a clean repo group to just its header ("No changes" inline) and show the commit area only when changes exist — this is what makes the sidebar scale past 2 repos
16. "Amend last commit" on a clean tree: if checking it keeps Commit disabled, reword-via-amend is impossible (bug); if it enables Commit, the "No changes" hint contradicts the button state. Decide the behavior and make hint + button agree
17. The change-count appears 3× for one repo (group header badge, CHANGES badge, folder count) — drop the CHANGES badge, the header already says it
18. No clear indicator of which repo group is the *active* one (the one the main panel follows) — the thin left border is too subtle to read as state; give the active group an explicit treatment (filled header / icon)
19. Empty-state text duplicated: "No changes · working tree clean" in the body and "No changes" again above Commit — one is enough (resolved by #15)
20. Message textarea is full height even when empty, ×N repos — start single-line and grow on focus/typing
21. Branch pill in group header will truncate badly on long names (feature/fable_approach barely fits) — middle-truncate, same treatment as main-panel pills (#10)