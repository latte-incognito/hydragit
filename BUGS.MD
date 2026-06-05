Result of manual testing:
 1. Blocker: Search by file name freezes UI and doesn't work
 2. Create tag button not working from side bar
 3. Show Diff nothing happens when click
 
 20. If git statechanged by another plugin or commands hydragit can stuck
 21 why  inside branches star shows for master and develop what it even means
 22 ABSOLUTELY do for inlin blame rich poup should appear on 5 seconds only and when cursor is above our inline blame only because its really distracting 

--- Found by automated tests (each item links to its failing test) ---
 23. Commit context menu (LogPane) — these items look enabled but do nothing (no on:click handler):
     Create Patch…, Show Repository at Revision, Compare with Local, Edit Commit Message…,
     Drop Commit, Interactively Rebase from Here…, Push All up to Here…
     test: webview/src/panels/index/components/LogPane.commitMenu.test.ts
 24. Commit-detail file context menu (DetailPane) — dead items (no handler):
     Compare with Local, Compare Before with Local, Open Repository Version,
     Revert Selected Changes, Cherry-Pick Selected Changes
     test: webview/src/panels/index/components/DetailPane.fileCtx.test.ts
 25. Branch/stash/tag context menus — items emit an action App.svelte never handles, so clicking does nothing:
     branch: Compare with…, Show Diff with Working Tree
     stash:  Unstash…, Clear, Show Diff, Show Diff in a New Tab   (stash "Show Diff" == #3)
     tag:    Show Diff with Working Tree
     test: webview/src/panels/index/contextMenuWiring.test.ts
 26. GoProcess never settles pending requests when the Go binary exits → the UI hangs.
     Root cause of #20 on the TS side (extension/src/goProcess.ts has no reject-on-exit).
     test: extension/src/goProcess.failure.test.ts
 27. Merge-conflict files are dropped by the Go status parser (status.go:resolveStatus has no
     case for UU/UA codes) — root cause of #19.
     test: internal/git/conflict_test.go
