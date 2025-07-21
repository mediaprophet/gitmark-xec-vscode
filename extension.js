    // Helper to get selected wallet
    function getSelectedWallet() {
        const wallets = context.globalState.get('gitmark-ecash.wallets', []);
        const selected = context.globalState.get('gitmark-ecash.selectedWallet', wallets[0]?.name);
        return wallets.find(w => w.name === selected);
    }

    // Show deposit address
    vscode.commands.registerCommand('gitmark-ecash.showDepositAddress', () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        const wallet = Wallet.fromMnemonic(w.seed, chronik);
        vscode.window.showInformationMessage(`Deposit address: ${wallet.getDepositAddress()}`);
    });

    // Show change address
    vscode.commands.registerCommand('gitmark-ecash.showChangeAddress', () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        const wallet = Wallet.fromMnemonic(w.seed, chronik);
        vscode.window.showInformationMessage(`Change address: ${wallet.getChangeAddress ? wallet.getChangeAddress() : '(not available)'}`);
    });

    // Show token address
    vscode.commands.registerCommand('gitmark-ecash.showTokenAddress', () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        const wallet = Wallet.fromMnemonic(w.seed, chronik);
        vscode.window.showInformationMessage(`Token address: ${wallet.getTokenAddress ? wallet.getTokenAddress() : '(not available)'}`);
    });

    // Show seed phrase
    vscode.commands.registerCommand('gitmark-ecash.showSeed', () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        vscode.window.showInformationMessage(`Seed phrase: ${w.seed}`);
    });

    // Show balance
    vscode.commands.registerCommand('gitmark-ecash.showBalance', async () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        try {
            const utxosResult = await chronik.address(w.address).utxos();
            let balance = 0;
            if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt(utxo.value), 0);
            }
            vscode.window.showInformationMessage(`Balance: ${balance} sats`);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to fetch balance.');
        }
    });

    // List UTXOs
    vscode.commands.registerCommand('gitmark-ecash.listUtxos', async () => {
        const w = getSelectedWallet();
        if (!w) return vscode.window.showErrorMessage('No wallet selected.');
        try {
            const utxosResult = await chronik.address(w.address).utxos();
            if (!utxosResult.utxos || utxosResult.utxos.length === 0) {
                vscode.window.showInformationMessage('No UTXOs found.');
                return;
            }
            const utxoList = utxosResult.utxos.map(u => `Value: ${u.value} | Height: ${u.height} | Outpoint: ${u.outpoint.txid}:${u.outpoint.outIdx}`).join('\n');
            vscode.window.showInformationMessage(`UTXOs:\n${utxoList}`);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to fetch UTXOs.');
        }
    });
const vscode = require('vscode');
const bip39 = require('bip39');
const { Wallet } = require('ecash-wallet');
const { ChronikClient } = require('chronik-client');

const chronik = new ChronikClient('https://chronik.be.cash/xec');
const { WalletTreeDataProvider } = require('./src/tree/WalletTreeDataProvider');
const { registerMarkCommitCommand } = require('./src/commands/markCommit');

function activate(context) {
    // Create and register the TreeDataProvider
    const walletTreeDataProvider = new WalletTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('walletsTreeView', walletTreeDataProvider);

    // Register a command to refresh the tree view
    vscode.commands.registerCommand('gitmark-ecash.refreshWallets', () => {
        walletTreeDataProvider.refresh();
    });

    // Register command to create a new wallet
    vscode.commands.registerCommand('gitmark-ecash.createWallet', async () => {
        const mnemonic = bip39.generateMnemonic();
        const wallets = context.globalState.get('gitmark-ecash.wallets', []);
        const name = `Wallet ${wallets.length + 1}`;
        const wallet = Wallet.fromMnemonic(mnemonic, chronik);
        const address = wallet.getDepositAddress();

        wallets.push({ name, address, seed: mnemonic });
        await context.globalState.update('gitmark-ecash.wallets', wallets);
        walletTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Created and saved: ${name}`);
    });

    // Register command to import a wallet
    vscode.commands.registerCommand('gitmark-ecash.importWallet', async () => {
        const mnemonic = await vscode.window.showInputBox({
            prompt: 'Enter your 12, 15, 18, 21, or 24-word seed phrase to import a wallet.',
            placeHolder: 'word1 word2 word3 ...'
        });

        if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim().split(/\s+/).length % 3 !== 0 || mnemonic.trim().split(/\s+/).length < 12 || mnemonic.trim().split(/\s+/).length > 24 || !bip39.validateMnemonic(mnemonic.trim())) {
            vscode.window.showErrorMessage('Invalid or empty seed phrase. Please enter a valid BIP39 mnemonic (12, 15, 18, 21, or 24 words).');
            return;
        }

        const wallets = context.globalState.get('gitmark-ecash.wallets', []);
        const name = `Wallet ${wallets.length + 1}`;
        const wallet = Wallet.fromMnemonic(mnemonic.trim(), chronik);
        const address = wallet.getDepositAddress();

        wallets.push({ name, address, seed: mnemonic.trim() });
        await context.globalState.update('gitmark-ecash.wallets', wallets);
        walletTreeDataProvider.refresh();
    });

    // Register command to remove a wallet (triggered from context menu)
    vscode.commands.registerCommand('gitmark-ecash.removeWallet', async (walletItem) => {
        const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove ${walletItem.label}? This cannot be undone.`, { modal: true }, 'Yes');
        if (confirm === 'Yes') {
            let wallets = context.globalState.get('gitmark-ecash.wallets', []);
            wallets = wallets.filter(w => w.address !== walletItem.address);
            await context.globalState.update('gitmark-ecash.wallets', wallets);
            walletTreeDataProvider.refresh();
        }
    });

    // Register command to copy address
    vscode.commands.registerCommand('gitmark-ecash.copyAddress', (walletItem) => {
        vscode.env.clipboard.writeText(walletItem.address);
        vscode.window.showInformationMessage('Address copied to clipboard.');
    });


    // Register the "mark commit" command from its own module
    registerMarkCommitCommand(context);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
