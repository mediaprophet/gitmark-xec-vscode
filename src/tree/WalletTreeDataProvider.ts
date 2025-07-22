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
        if (!element) {
            // Top-level: show wallets
            const wallets = this.context.globalState.get<WalletInfo[]>('gitmark-ecash.wallets', []);
            if (wallets.length === 0) {
                return Promise.resolve([]);
            }
            const fs = require('fs');
            const path = require('path');
            const errorLogPath = path.join(__dirname, '../../xec-errors.md');
            const walletItems = await Promise.all(wallets.map(async (walletInfo) => {
                let balance = -1; // Default to error state
                let errorMsg = '';
                try {
                    // Use Chronik address endpoint for balance
                    const utxosResult = await chronik.address(walletInfo.address).utxos();
                    console.log(`[DEBUG] Chronik UTXO result for ${walletInfo.address}:`, utxosResult);
                    if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                        console.log('All UTXOs for address', walletInfo.address, utxosResult.utxos);
                        const fs = require('fs');
                        const logPath = 'f:/github-dev/markdown-ld-2025/gitmark-xec-vscode/xec-errors.md';
                        utxosResult.utxos.forEach((utxo, idx) => {
                            const logLine = `[DEBUG] UTXO #${idx} fields: ${JSON.stringify(Object.keys(utxo))}, value: ${(utxo as any).value}, sats: ${(utxo as any).sats}\n`;
                            fs.appendFileSync(logPath, logLine);
                        });
                        balance = utxosResult.utxos.reduce((acc, utxo) => {
                            // Try both .value and .sats fields
                            const v = Number((utxo as any).value ?? (utxo as any).sats);
                            return acc + (Number.isFinite(v) ? v : 0);
                        }, 0);
                        fs.appendFileSync(logPath, `[DEBUG] Calculated balance for ${walletInfo.address}: ${balance}\n`);
                    } else {
                        errorMsg = `No UTXOs found for address ${walletInfo.address}`;
                    }
                } catch (e) {
                    errorMsg = `Failed to fetch balance for ${walletInfo.name} (${walletInfo.address}): ${String(e)}`;
                    console.error(errorMsg);
                }
                if (balance === -1 && errorMsg) {
                    // Append error to xec-errors.md
                    try {
                        fs.appendFileSync(errorLogPath, `- ${new Date().toISOString()} - ${errorMsg}\n`);
                    } catch (err) {
                        console.error('Failed to write to xec-errors.md:', err);
                    }
                }
                return new WalletTreeItem(walletInfo.name, walletInfo.address, balance, vscode.TreeItemCollapsibleState.Collapsed, errorMsg);
            }));
            return Promise.resolve(walletItems);
        } else {
            // Child: show transaction history for this wallet
            try {
                const historyResult = await chronik.address(element.address).history(0, 10);
                const txs = historyResult.txs || [];
                return txs.map(tx => {
                    const label = `Tx: ${tx.txid}`;
                    const description = `${(tx.inputs || []).length} in / ${(tx.outputs || []).length} out`;
                    const blockHeight = (tx.block && typeof tx.block.height === 'number') ? tx.block.height : 'unconfirmed';
                    const txItem = new WalletTreeItem(label, '', 0, vscode.TreeItemCollapsibleState.None);
                    txItem.description = description;
                    txItem.tooltip = `Block: ${blockHeight}\n${description}`;
                    txItem.contextValue = 'transaction';
                    txItem.command = {
                        command: 'gitmark-ecash.viewOnExplorer',
                        title: 'View on Explorer',
                        arguments: [tx.txid]
                    };
                    return txItem;
                });
            } catch (e) {
                const errorItem = new WalletTreeItem('Failed to fetch transaction history', '', 0, vscode.TreeItemCollapsibleState.None, String(e));
                return [errorItem];
            }
        }
    }
}

class WalletTreeItem extends vscode.TreeItem {
    public transactions: any[] = [];
    constructor(
        public readonly label: string,
        public readonly address: string,
        public readonly balance: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly errorMsg?: string
    ) {
        super(label, collapsibleState);
        const balanceXec = balance === -1 ? 'Error' : (balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const balanceString = balance === -1 ? `Error: ${errorMsg || 'Unknown'}` : `${balanceXec} XEC`;
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
