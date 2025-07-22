import * as vscode from 'vscode';
import { ChronikClient } from 'chronik-client';

// The constructor now expects an array of URLs.
const chronik = new ChronikClient(['https://chronik.be.cash/xec']);

interface WalletInfo {
    name: string;
    address: string;
}

export class WalletTreeDataProvider implements vscode.TreeDataProvider<WalletTreeItem> {
    // Correctly type the event emitter to match the base TreeDataProvider interface.
    private _onDidChangeTreeData: vscode.EventEmitter<WalletTreeItem | undefined | null> = new vscode.EventEmitter<WalletTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<WalletTreeItem | undefined | null> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        // Fire with 'undefined' to signal a full refresh.
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WalletTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WalletTreeItem): Promise<WalletTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const wallets = this.context.globalState.get<WalletInfo[]>('gitmark-ecash.wallets', []);
        if (wallets.length === 0) {
            return Promise.resolve([]);
        }

        const walletItems = await Promise.all(wallets.map(async (wallet) => {
            let balance = 0;
            try {
                const utxosResult = await chronik.address(wallet.address).utxos();
                if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                    // Use the correct type and property for value in Utxo.
                    // Use the correct property for amount in ScriptUtxo.
                    balance = utxosResult.utxos.reduce((acc: number, utxo) => acc + utxo.value, 0);
                }
            } catch (e) {
                console.error(`Failed to fetch balance for ${wallet.name}:`, e);
                balance = -1; // Indicate error
            }
            return new WalletTreeItem(wallet.name, wallet.address, balance, vscode.TreeItemCollapsibleState.None);
        }));

        return Promise.resolve(walletItems);
    }
}

class WalletTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly address: string,
        public readonly balance: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        const balanceString = balance === -1 ? 'Error' : `${balance} sats`;
        this.tooltip = `${this.address}\nBalance: ${balanceString}`;
        this.description = `Balance: ${balanceString}`;
        this.contextValue = 'wallet';
        // Assign a theme icon using the static property.
        this.iconPath = vscode.ThemeIcon.Folder;
    }
}
