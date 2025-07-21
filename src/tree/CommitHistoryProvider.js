const vscode = require('vscode');

class CommitHistoryProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            // Root: return commit history items
            const commits = this.context.globalState.get('gitmark-ecash.commitHistory', []);
            return commits.map(c => {
                const item = new vscode.TreeItem(`${c.hash} (${c.date})`, vscode.TreeItemCollapsibleState.None);
                item.contextValue = 'commit';
                item.description = c.message;
                item.tooltip = `Marked by ${c.walletName}`;
                return item;
            });
        }
        return [];
    }
}

module.exports = { CommitHistoryProvider };
