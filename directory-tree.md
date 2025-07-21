# Project Directory Structure: Gitmark for eCash VS Code Extension

```
.gitignore
.vscode/
.vscodeignore
.eslintrc.json
extension.js
functionalSpecification.md
functionalSpecs.json
images/
node_modules/
notes.md
package-lock.json
package.json
project-progress.json
promptplan.json
resources/
src/
  commands/
    markCommit.js
  providers/
    WalletsTreeProvider.js
    wallets.js
    sidebar.js
  tree/
    (planned: WalletTreeDataProvider.js)
test/
  runTest.js
  suite/
    index.js
    extension.test.js
```

## Structure Explanation
- **extension.js**: Main entry point, registers tree view and commands.
- **src/commands/**: Command modules (e.g., markCommit.js).
- **src/providers/**: Tree view provider and wallet management logic.
- **src/tree/**: (Planned) Dedicated folder for tree view provider implementation.
- **test/**: Test environment and suite files.
- **images/**: Extension and activity bar icons.
- **resources/**: Additional assets.
- **functionalSpecification.md / functionalSpecs.json / promptplan.json / project-progress.json**: Documentation and project planning.
