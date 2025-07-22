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
    // FIX: Correctly type the event emitter to match the base TreeDataProvider interface.
    private _onDidChangeTreeData: vscode.EventEmitter<CommitHistoryItem | undefined | null> = new vscode.EventEmitter<CommitHistoryItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<CommitHistoryItem | undefined | null> = this._onDidChangeTreeData.event;

    private _isLoading: boolean = true;

    constructor(private context: vscode.ExtensionContext) {
        // Simulate loading for demonstration; set to false after a short delay
        setTimeout(() => {
            this._isLoading = false;
            this.refresh();
        }, 1000);
    }

    /**
     * Triggers a refresh of the tree view.
     */
    refresh(): void {
        // FIX: Fire with 'undefined' to signal a full refresh.
        this._onDidChangeTreeData.fire(undefined);
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
    async getChildren(element?: CommitHistoryItem): Promise<CommitHistoryItem[]> {
        if (this._isLoading) {
            return [new CommitHistoryItem({ commitHash: 'Loading...', txid: '', timestamp: Date.now() }, vscode.TreeItemCollapsibleState.None)];
        }
        if (element) {
            return [];
        }
        // Retrieve the stored history from global state.
        const history = this.context.globalState.get<MarkedCommit[]>('gitmark-ecash.commitHistory', []);

        if (history.length === 0) {
            return [new CommitHistoryItem({ commitHash: 'No data provider found.', txid: '', timestamp: Date.now() }, vscode.TreeItemCollapsibleState.None)];
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
        // FIX: Assign a theme icon using the icon name string directly.
        this.iconPath = vscode.ThemeIcon.File; // Or use: this.iconPath = 'git-commit';
        this.contextValue = 'commitHistoryItem';

        // Remove the explorer link command from the tree item
        // this.command = {
        //     command: 'gitmark-ecash.viewOnExplorer',
        //     title: 'View on Block Explorer',
        //     arguments: [typeof this.commit.txid === 'string' ? this.commit.txid : '']
        // };
    }
}
