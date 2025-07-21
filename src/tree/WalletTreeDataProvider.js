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
        if (element) {
            return Promise.resolve([]);
        }

        // Wallet metadata is stored in globalState (name, address)
        const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
        if (wallets.length === 0) {
            return Promise.resolve([]);
        }

        const walletItems = await Promise.all(wallets.map(async (wallet) => {
            let balance = 0;
            try {
                const utxosResult = await chronik.address(wallet.address).utxos();
                if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                    balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt(utxo.value), 0);
                }
            } catch (e) {
                console.error(`Failed to fetch balance for ${wallet.name}:`, e);
                balance = 'Error';
            }
            return new WalletTreeItem(wallet.name, wallet.address, balance, vscode.TreeItemCollapsibleState.None);
        }));

        return Promise.resolve(walletItems);
    }
}

class WalletTreeItem extends vscode.TreeItem {
    constructor(label, address, balance, collapsibleState) {
        super(label, collapsibleState);
        this.address = address;
        this.balance = balance;
        this.tooltip = `${this.address}\nBalance: ${this.balance} sats`;
        this.description = `Balance: ${this.balance} sats`;
        this.contextValue = 'wallet'; // Used for context-menu actions
        this.iconPath = new vscode.ThemeIcon('credit-card');
    }
}

module.exports = { WalletTreeDataProvider };
