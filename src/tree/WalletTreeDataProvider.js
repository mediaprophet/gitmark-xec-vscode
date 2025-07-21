const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');

const chronik = new ChronikClient('https://chronik.be.cash/xec');

class WalletTreeDataProvider {
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
            // Root: return wallet items
            const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
            const selected = this.context.globalState.get('gitmark-ecash.selectedWallet', null);
            return await Promise.all(wallets.map(async w => {
                let balance = 0;
                try {
                    if (w.address) {
                        const utxosResult = await chronik.address(w.address).utxos();
                        if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                            balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt(utxo.value), 0);
                        }
                    }
                } catch (e) {
                    balance = 'Error';
                }
                const item = new vscode.TreeItem(`${w.name} (${balance} sats)`, vscode.TreeItemCollapsibleState.None);
                item.contextValue = 'wallet';
                item.description = w.address;
                item.iconPath = new vscode.ThemeIcon(w.name === selected ? 'star-full' : 'credit-card');
                item.address = w.address;
                item.label = w.name;
                return item;
            }));
        }
        // No children for wallet items
        return [];
    }
}

module.exports = { WalletTreeDataProvider };
