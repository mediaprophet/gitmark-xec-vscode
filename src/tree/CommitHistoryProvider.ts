import * as vscode from 'vscode';

/**
 * Defines the structure for storing a record of a marked commit.
 */
export interface MarkedCommit {
    commitHash: string;
    txid: string;
    timestamp: number; // Stored as a Unix timestamp (ms)
}

/**
 * Provides the data for the "Commit History" tree view.
 */
export class CommitHistoryProvider implements vscode.TreeDataProvider<CommitHistoryItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommitHistoryItem | undefined | null | void> = new vscode.EventEmitter<CommitHistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommitHistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Triggers a refresh of the tree view.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the tree item for the given element.
     */
    getTreeItem(element: CommitHistoryItem): vscode.TreeItem {
        return element;
    }

    /**
     * Gets the children of the given element, or the root elements if no element is provided.
     */
    async getChildren(element?: CommitHistoryItem): Promise<vscode.TreeItem[]> {
        // This view does not have nested children.
        if (element) {
            return [];
        }

        // Retrieve the stored history from global state.
        const history = this.context.globalState.get<MarkedCommit[]>('gitmark-ecash.commitHistory', []);

        if (history.length === 0) {
            const placeholderItem = new vscode.TreeItem("No marked commits yet.", vscode.TreeItemCollapsibleState.None);
            placeholderItem.iconPath = new vscode.ThemeIcon('history');
            return [placeholderItem];
        }

        // Sort history to show the most recent commits first.
        history.sort((a, b) => b.timestamp - a.timestamp);

        // Map the stored data to custom TreeItem objects.
        return history.map(commit => new CommitHistoryItem(commit, vscode.TreeItemCollapsibleState.None));
    }
}

/**
 * Represents a single item in the Commit History tree view.
 */
class CommitHistoryItem extends vscode.TreeItem {
    constructor(
        public readonly commit: MarkedCommit,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        // Use the short 7-character commit hash as the label.
        super(commit.commitHash.substring(0, 7), collapsibleState);
        
        // Use the shortened transaction ID as the description.
        this.description = `tx: ${commit.txid.substring(0, 10)}...`;
        
        // Provide full details in the tooltip on hover.
        const date = new Date(commit.timestamp).toLocaleString();
        this.tooltip = `Commit: ${commit.commitHash}\nTXID: ${commit.txid}\nDate: ${date}`;
        
        // Set the icon and context value for menu contributions.
        this.iconPath = new vscode.ThemeIcon('git-commit');
        this.contextValue = 'commitHistoryItem';

        // Define the command to be executed when the item is clicked.
        this.command = {
            command: 'gitmark-ecash.viewOnExplorer',
            title: 'View on Block Explorer',
            arguments: [this.commit.txid]
        };
    }
}
