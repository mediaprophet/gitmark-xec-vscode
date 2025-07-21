const bip39 = require('bip39');
const { Wallet } = require('ecash-wallet');
const { ChronikClient } = require('chronik-client');
const chronik = new ChronikClient('https://chronik.be.cash/xec');
let localforage;
try {
    localforage = require('localforage');
} catch (e) {
    // localforage is only available in the webview/browser context
    localforage = null;
}

class WalletManager {
    constructor(context) {
        this.context = context;
        this.walletsKey = 'gitmark-ecash.wallets';
        this.selectedKey = 'gitmark-ecash.selectedWallet';
    }

    getWallets() {
        return this.context.globalState.get(this.walletsKey, []);
    }

    getSelectedWallet() {
        return this.context.globalState.get(this.selectedKey, null);
    }

    async createWallet() {
        const seed = bip39.generateMnemonic();
        const wallet = Wallet.fromMnemonic(seed, chronik);
        const address = wallet.getDepositAddress();
        const wallets = this.getWallets();
        const name = `Wallet ${wallets.length + 1}`;
        wallets.push({ name, address, seed });
        await this.context.globalState.update(this.walletsKey, wallets);
        if (localforage) await localforage.setItem('wallet-' + name + '-seed', seed);
        if (wallets.length === 1) {
            await this.context.globalState.update(this.selectedKey, name);
        }
        return { name, address };
    }

    async importWallet(seed) {
        if (!seed || !bip39.validateMnemonic(seed)) {
            throw new Error('Invalid seed phrase');
        }
        const wallet = Wallet.fromMnemonic(seed, chronik);
        const address = wallet.getDepositAddress();
        const wallets = this.getWallets();
        const name = `Wallet ${wallets.length + 1}`;
        wallets.push({ name, address, seed });
        await this.context.globalState.update(this.walletsKey, wallets);
        if (localforage) await localforage.setItem('wallet-' + name + '-seed', seed);
        return { name, address };
    }

    async removeWallet(name) {
        let wallets = this.getWallets();
        wallets = wallets.filter(w => w.name !== name);
        await this.context.globalState.update(this.walletsKey, wallets);
        if (localforage) await localforage.removeItem('wallet-' + name + '-seed');
        let selected = this.getSelectedWallet();
        if (selected === name) {
            await this.context.globalState.update(this.selectedKey, wallets[0]?.name || null);
        }
    }

    async selectWallet(name) {
        await this.context.globalState.update(this.selectedKey, name);
    }

    async getPrivateKey(name) {
        if (localforage) {
            return await localforage.getItem('wallet-' + name + '-seed');
        }
        return null;
    }
}

module.exports = { WalletManager };
