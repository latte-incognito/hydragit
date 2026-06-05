Result of manual testing:
 1. Blocker: Search by file name freezes UI and doesn't work
 2. Create tag button not working from side bar
 3. Show Diff nothing happens when click

 19. [FIXED] Merge conflicts on side bar not ready — see #27.
 20. [FIXED] If git state changed by another plugin or commands hydragit can stuck — see #26.
 21. why inside branches star shows for master and develop what it even means
 22. [FIXED] Inline blame rich popup now appears only after a rest delay
     (hydragit.lineBlame.hoverDelay, default 5000ms) and only when hovering
     directly over the inline blame annotation, never over the code.

--- Found by automated tests (each item links to its failing test) ---
 23. [FIXED] Commit context menu (LogPane) — dead items now wired:
     Create Patch… (format-patch → save dialog), Compare with Local (detail-pane ref diff),
     Edit Commit Message… (amend / scripted rebase reword), Drop Commit (rebase --onto),
     Interactively Rebase from Here… (drag-drop editor, GitLens/IntelliJ pause-on-conflict),
     Push All up to Here… (push <sha>:branch).
     DEFERRED: Show Repository at Revision (intentionally dimmed/disabled).
     test: webview/src/panels/index/components/LogPane.commitMenu.test.ts
 24. [FIXED] Commit-detail file context menu (DetailPane) — all wired:
     Open Repository Version, Revert/Cherry-Pick Selected Changes (commit-level),
     Compare with Local / Compare Before with Local (ref ↔ working-tree diff editor).
     test: webview/src/panels/index/components/DetailPane.fileCtx.test.ts
 25. [FIXED] Branch/stash/tag context menus — all wired:
     branch: Compare with… (ref↔ref), Show Diff with Working Tree
     stash:  Unstash…, Clear, Show Diff, Show Diff in a New Tab
     tag:    Show Diff with Working Tree
     test: webview/src/panels/index/contextMenuWiring.test.ts
 26. [FIXED] GoProcess never settled pending requests when the Go binary exits → the UI hung.
     Now rejects all in-flight requests on 'exit'/'error' (extension/src/goProcess.ts:rejectAll).
     test: extension/src/goProcess.failure.test.ts
 27. [FIXED] Merge-conflict files were dropped by the Go status parser; resolveStatus now maps
     every unmerged code (UU/AA/DD/AU/UA/DU/UD) to "!" and the sidebar routes "!" to the
     merge resolver.
     test: internal/git/conflict_test.go

