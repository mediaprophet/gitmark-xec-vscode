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

    getChildren(element) {
        // Placeholder: In the future, this will return the list of marked commits.
        if (element) {
            return Promise.resolve([]);
        }
        
        // For now, show a placeholder message.
        const placeholderItem = new vscode.TreeItem("No marked commits yet.", vscode.TreeItemCollapsibleState.None);
        placeholderItem.iconPath = new vscode.ThemeIcon('history');
        return Promise.resolve([placeholderItem]);
    }
}

module.exports = { CommitHistoryProvider };
