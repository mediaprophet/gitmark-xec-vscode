import * as vscode from 'vscode';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet'; // Import the Wallet class

// The constructor now expects an array of URLs.
const chronik = new ChronikClient([
    'https://chronik.be.cash/xec',
    'https://chronik.fabien.cash'
]);

interface WalletInfo {
    name: string;
    address: string;
}

export class WalletTreeDataProvider implements vscode.TreeDataProvider<WalletTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WalletTreeItem | undefined | null> = new vscode.EventEmitter<WalletTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<WalletTreeItem | undefined | null> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
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

        const walletItems = await Promise.all(wallets.map(async (walletInfo) => {
            let balance = -1; // Default to error state
            try {
                // Fetch balance using ChronikClient directly
                const utxosResult = await chronik.address(walletInfo.address).utxos();
                                    if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                                        console.log('All UTXOs for address', walletInfo.address, utxosResult.utxos);
                                        balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt((utxo as any).value), 0);
                                    }
            } catch (e) {
                console.error(`Failed to fetch balance for ${walletInfo.name}:`, e);
                // Balance remains -1 to indicate an error
            }
            return new WalletTreeItem(walletInfo.name, walletInfo.address, balance, vscode.TreeItemCollapsibleState.None);
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
                    this.iconPath = {
                        light: vscode.Uri.file(__dirname + '/../../images/account.svg'),
                        dark: vscode.Uri.file(__dirname + '/../../images/account.svg')
                    };
    }
}
