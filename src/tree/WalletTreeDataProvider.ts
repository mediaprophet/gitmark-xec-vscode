import * as vscode from 'vscode';
import { ChronikClient } from 'chronik-client';
import { CHRONIK_ENDPOINTS } from '../constants/chronikEndpoints';
import { Wallet } from 'ecash-wallet';
import * as ecashaddr from 'ecashaddrjs';

const chronik = new ChronikClient(CHRONIK_ENDPOINTS);

interface WalletInfo {
    name: string;
    address: string;
}

function decodeOutputScript(outputScript: string): string {
    try {
        // Use ecashaddrjs API to decode outputScript to address
        return ecashaddr.encodeOutputScript(outputScript, 'ecash');
    } catch (error) {
        const parts = outputScript.split(':');
        return parts.length > 1 ? parts[1] : outputScript;
    }
}

export class WalletTreeDataProvider implements vscode.TreeDataProvider<WalletTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WalletTreeItem | undefined | null> = new vscode.EventEmitter<WalletTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<WalletTreeItem | undefined | null> = this._onDidChangeTreeData.event;
    private _isLoading: boolean = true;

    constructor(private context: vscode.ExtensionContext) {
        setTimeout(() => {
            this._isLoading = false;
            this.refresh();
        }, 1000);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WalletTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WalletTreeItem): Promise<WalletTreeItem[]> {
        if (!element) {
            if (this._isLoading) {
                return [new WalletTreeItem('Loading...', '', -1, vscode.TreeItemCollapsibleState.None)];
            }
            // Top-level: show wallets
            const wallets = this.context.globalState.get<WalletInfo[]>('gitmark-ecash.wallets', []);
            if (wallets.length === 0) {
                return [];
            }
            const selectedWalletName = this.context.globalState.get<string>('gitmark-ecash.selectedWallet');
            const walletItems = await Promise.all(wallets.map(async (walletInfo) => {
                let balance = -1;
                let errorMsg = '';
                try {
                    const utxosResult = await chronik.address(walletInfo.address).utxos();
                    if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                                balance = Number(utxosResult.utxos.reduce((acc: bigint, utxo: any) => {
                                    let satsValue = (utxo as any).sats;
                                    if (typeof satsValue === 'string') {
                                        const match = satsValue.match(/\d+/);
                                        satsValue = match ? BigInt(match[0]) : 0n;
                                    } else if (typeof satsValue === 'number') {
                                        satsValue = BigInt(satsValue);
                                    }
                                    return acc + satsValue;
                                }, 0n));
                    } else {
                        errorMsg = `No UTXOs found for address ${walletInfo.address}`;
                    }
                } catch (e) {
                    errorMsg = `Failed to fetch balance for ${walletInfo.name} (${walletInfo.address}): ${String(e)}`;
                }
                const item = new WalletTreeItem(walletInfo.name, walletInfo.address, balance, vscode.TreeItemCollapsibleState.Collapsed, errorMsg);
                if (walletInfo.name === selectedWalletName) {
                    item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
                }
                return item;
            }));
            return walletItems;
        } else {
            // Child: show transaction history for this wallet
            try {
                const historyResult = await chronik.address(element.address).history(0, 20);
                const txs = historyResult.txs || [];
                return Promise.all(txs.map(async tx => {
                    return this.processTransaction(tx, element.address);
                }));
            } catch (e) {
                const errorItem = new WalletTreeItem('Error fetching history', '', -1, vscode.TreeItemCollapsibleState.None, String(e));
                return [errorItem];
            }
        }
    }

    private async processTransaction(tx: any, walletAddress: string): Promise<WalletTreeItem> {
        // Get outputScript for wallet address
        let p2pkhScript: string;
        try {
            p2pkhScript = ecashaddr.getOutputScriptFromAddress(walletAddress);
        } catch (e) {
            p2pkhScript = '';
        }

        const isInputFromWallet = tx.inputs.some((input: any) => input.outputScript === p2pkhScript);
        const isOutputToWallet = tx.outputs.some((output: any) => output.outputScript === p2pkhScript);

        let direction: 'Received' | 'Sent' | 'Self-transfer' = 'Sent';
        let amount = 0;
        let counterparty = 'Unknown';

        if (isInputFromWallet) {
            const totalSentFromWallet = tx.inputs
                .filter((input: any) => input.outputScript === p2pkhScript)
                .reduce((sum: number, input: any) => sum + parseInt(input.sats || '0', 10), 0);
            const totalReturnedToWallet = tx.outputs
                .filter((output: any) => output.outputScript === p2pkhScript)
                .reduce((sum: number, output: any) => sum + parseInt(output.sats || '0', 10), 0);
            const otherOutputs = tx.outputs.filter((output: any) => output.outputScript !== p2pkhScript);
            if (otherOutputs.length > 0) {
                direction = 'Sent';
                amount = totalSentFromWallet - totalReturnedToWallet;
                counterparty = decodeOutputScript(otherOutputs[0].outputScript);
            } else {
                direction = 'Self-transfer';
                amount = totalSentFromWallet - totalReturnedToWallet;
                counterparty = walletAddress;
            }
        } else if (isOutputToWallet) {
            direction = 'Received';
            amount = tx.outputs
                .filter((output: any) => output.outputScript === p2pkhScript)
                .reduce((sum: number, output: any) => sum + parseInt(output.sats || '0', 10), 0);
            try {
                const prevOut = tx.inputs[0]?.prevOut;
                if (prevOut && typeof prevOut.txid === 'string' && typeof prevOut.outIdx === 'number') {
                    const prevTx = await chronik.tx(prevOut.txid);
                    const prevOutput = prevTx.outputs[prevOut.outIdx];
                    if (prevOutput && prevOutput.outputScript) {
                        counterparty = decodeOutputScript(prevOutput.outputScript);
                    } else {
                        counterparty = 'Unknown Sender';
                    }
                }
            } catch (e) {
                counterparty = 'Unknown Sender';
            }
        }

        const amountXEC = (amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const label = `${direction} ${amountXEC} XEC`;
        const description = direction === 'Received' ? `from ${counterparty}` : `to ${counterparty}`;

        const txItem = new WalletTreeItem(label, tx.txid, 0, vscode.TreeItemCollapsibleState.None);
        txItem.description = description;
        txItem.tooltip = `TXID: ${tx.txid}\nAmount: ${amountXEC} XEC\nCounterparty: ${counterparty}`;
        txItem.counterpartyAddress = counterparty;
        txItem.txAddress = counterparty;
        txItem.contextValue = 'transaction';
        txItem.command = {
            command: 'gitmark-ecash.viewOnExplorer',
            title: 'View on Explorer',
            arguments: [typeof tx.txid === 'string' ? tx.txid : '']
        };
        let iconColorId = 'charts.blue';
        if (direction === 'Received') iconColorId = 'charts.green';
        if (direction === 'Sent') iconColorId = 'charts.red';
        txItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(iconColorId));
        return txItem;
    }
}

class WalletTreeItem extends vscode.TreeItem {
    public counterpartyAddress?: string;
    public txAddress?: string;
    public transactions: any[] = [];
    constructor(
        public readonly label: string,
        public readonly address: string,
        public readonly balance: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly errorMsg?: string
    ) {
        super(label, collapsibleState);
        if (!this.contextValue || this.contextValue !== 'transaction') {
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
}
// Add a command handler for double-click or single wallet selection
export function registerWalletTxHistoryCommand(context: vscode.ExtensionContext, treeDataProvider: WalletTreeDataProvider) {
    vscode.commands.registerCommand('gitmark-ecash.showWalletTxHistory', async (walletItem: WalletTreeItem) => {
        try {
            // Fetch last 10 transactions for the wallet
            const historyResult = await chronik.address(walletItem.address).history(0, 10);
            walletItem.transactions = historyResult.txs || [];
            vscode.window.showInformationMessage(`Last 10 transactions for ${walletItem.label}:\n` + (walletItem.transactions as any[]).map((tx: any) => tx.txid).join('\n'));
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to fetch transaction history for ${walletItem.label}`);
        }
    });
}