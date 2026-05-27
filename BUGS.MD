Result of manual testing:
 1. Blocker: Search by file name freezes UI and doesn't work
 2. Create tag not working from side bar
 3. Show Diff and Show Diff in new tab whats the difference 
 4. Context Menus inside Branches, should not appear or should provide some interesting features, like renaming branches, or folders with next
 5. Create separate GitHub for tests 
 6. Side pane should expand untill the end of the screen only then there should ve internall scroll right notw its  ugly fixed at the top 
 7. ✅ in Branches pane tags should be closed by default
 8 in branches pane double click on Tag should open valid commit and banch inside commit pane 
 9. ✅ Stash show, should probably show contents instead of just changes 
 10. Ask claude what cool features missing.
 11. I totally moved to use this extension instead of gitlens
 12. ✅ Status pane is kinda usefull but error message there  sometimes way bigger than 1 line so, probably need to handle it .
 13. ✅ ADD playwright tests that will cover functionality
 14. ✅ Commit and commit & push buttons inside side bar, commit is always hihlighted. And also need to add processing errors inside that side bar. 
 15. ✅ Deselect Stashes , because Pop Apply Show Drop buttons don't disapper.
 16. ✅ Add Hydragit logo inside the status bar of Hydragit near branch name
 18. Support multi-repo workspaces, monorepos, and submodules (repo picker like IntelliJ)
 19. Handle startup in a folder with no git repo (show friendly message instead of errors)
 20. Old commit meessage should be cleaned from commit message are on sidebar after commit
 21. fatal: The current branch feat/bug_fixes has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin feat/bug_fixes

To have this happen automatically for branches without a tracking
upstream, see 'push.autoSetupRemote' in 'git help config'. If there is nowhere to commit and push, just block commit and push button , leave only commit