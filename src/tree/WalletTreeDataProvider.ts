import * as vscode from 'vscode';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import * as ecashaddr from 'ecashaddrjs';

// The constructor now expects an array of URLs.
const chronik = new ChronikClient([
    'https://chronik.cash',
    'https://chronik.e.cash',
    'https://chronik.be.cash/xec',
    'https://chronik.fabien.cash',
    'https://chronik-native2.fabien.cash',
    'https://chronik-native3.fabien.cash',
    'https://chronik.pay2stay.com/xec2',
    'https://chronik-native1.fabien.cash',
    'https://chronik1.alitayin.com',
    'https://chronik2.alitayin.com'
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
                // Convert address to hash160 for Chronik script endpoint
                const { hash } = ecashaddr.decodeCashAddress(walletInfo.address);
                const hash160 = Buffer.from(hash).toString('hex');
                const utxosResult = await chronik.script('p2pkh', hash160).utxos();
                if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                    console.log('All UTXOs for address', walletInfo.address, utxosResult.utxos);
                    balance = utxosResult.utxos.reduce((acc, utxo) => {
                        const v = Number((utxo as any).value);
                        return acc + (Number.isFinite(v) ? v : 0);
                    }, 0);
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
    public transactions: any[] = [];
    constructor(
        public readonly label: string,
        public readonly address: string,
        public readonly balance: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    const balanceXec = balance === -1 ? 'Error' : (balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const balanceString = balance === -1 ? 'Error' : `${balanceXec} XEC`;
    this.tooltip = `${this.address}\nBalance: ${balanceString}`;
    this.description = `Balance: ${balanceString}`;
        this.contextValue = 'wallet';
        this.iconPath = {
            light: vscode.Uri.file(__dirname + '/../../images/account.svg'),
            dark: vscode.Uri.file(__dirname + '/../../images/account.svg')
        };
    }
}
// Add a command handler for double-click or single wallet selection
export function registerWalletTxHistoryCommand(context: vscode.ExtensionContext, treeDataProvider: WalletTreeDataProvider) {
    vscode.commands.registerCommand('gitmark-ecash.showWalletTxHistory', async (walletItem: WalletTreeItem) => {
        try {
            // Fetch last 10 transactions for the wallet
            const historyResult = await chronik.address(walletItem.address).history(0, 10);
            walletItem.transactions = historyResult.txs || [];
            // Show a panel or update the tree view (placeholder)
            vscode.window.showInformationMessage(`Last 10 transactions for ${walletItem.label}:\n` + walletItem.transactions.map(tx => tx.txid).join('\n'));
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to fetch transaction history for ${walletItem.label}`);
        }
    });
}
