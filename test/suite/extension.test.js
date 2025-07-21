const assert = require('assert');
const vscode = require('vscode');

describe('Gitmark for eCash Extension', function () {
    it('should activate without error', async function () {
        const ext = vscode.extensions.getExtension('mediaprophet.gitmark-ecash');
        await ext.activate();
        assert.ok(ext.isActive);
    });

    it('should register the walletsTreeView', async function () {
        const views = vscode.window.createTreeView('walletsTreeView', { treeDataProvider: { getChildren: () => [], getTreeItem: () => null } });
        assert.ok(views);
    });
});
