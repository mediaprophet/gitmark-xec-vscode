const vscode = require('vscode');
const bip39 = require('bip39');
const { Wallet } = require('ecash-wallet'); // Changed from ecash-lib
const { WalletTreeDataProvider } = require('./src/tree/WalletTreeDataProvider');
const { CommitHistoryProvider } = require('./src/tree/CommitHistoryProvider');
const { registerMarkCommitCommand } = require('./src/commands/markCommit');

function activate(context) {
    // --- SETUP TREE PROVIDERS ---
    const walletTreeDataProvider = new WalletTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('walletsTreeView', walletTreeDataProvider);

    const commitHistoryProvider = new CommitHistoryProvider(context);
    vscode.window.registerTreeDataProvider('commitHistoryView', commitHistoryProvider);


    // --- REGISTER COMMANDS ---
    vscode.commands.registerCommand('gitmark-ecash.refreshWallets', () => {
        walletTreeDataProvider.refresh();
        commitHistoryProvider.refresh();
    });

    // Command to create a new wallet
    vscode.commands.registerCommand('gitmark-ecash.createWallet', async () => {
        const seed = bip39.generateMnemonic();
        const wallet = await Wallet.fromMnemonic(seed); // Use new Wallet class
        const address = wallet.getAddress();
        
        const wallets = context.globalState.get('gitmark-ecash.wallets', []);
        const name = `Wallet ${wallets.length + 1}`;

        wallets.push({ name, address });
        await context.globalState.update('gitmark-ecash.wallets', wallets);
        await context.secrets.store(address, seed);

        walletTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Created and saved: ${name}`);
    });

    // Command to import a wallet
    vscode.commands.registerCommand('gitmark-ecash.importWallet', async () => {
        const seed = await vscode.window.showInputBox({ prompt: 'Enter your 12-word seed phrase.' });

        if (!seed || !bip39.validateMnemonic(seed)) {
            vscode.window.showErrorMessage('Invalid or empty seed phrase.');
            return;
        }
        
        const wallet = await Wallet.fromMnemonic(seed); // Use new Wallet class
        const address = wallet.getAddress();
        const wallets = context.globalState.get('gitmark-ecash.wallets', []);

        if (wallets.find(w => w.address === address)) {
            vscode.window.showWarningMessage('This wallet has already been imported.');
            return;
        }

        const name = `Wallet ${wallets.length + 1}`;
        wallets.push({ name, address });
        await context.globalState.update('gitmark-ecash.wallets', wallets);
        await context.secrets.store(address, seed);

        walletTreeDataProvider.refresh();
    });

    // Command to remove a wallet
    vscode.commands.registerCommand('gitmark-ecash.removeWallet', async (walletItem) => {
        const confirm = await vscode.window.showWarningMessage(`Remove ${walletItem.label}?`, { modal: true }, 'Yes');
        if (confirm === 'Yes') {
            let wallets = context.globalState.get('gitmark-ecash.wallets', []);
            wallets = wallets.filter(w => w.address !== walletItem.address);
            await context.globalState.update('gitmark-ecash.wallets', wallets);
            await context.secrets.delete(walletItem.address);
            walletTreeDataProvider.refresh();
        }
    });

    // Command to copy address
    vscode.commands.registerCommand('gitmark-ecash.copyAddress', (walletItem) => {
        vscode.env.clipboard.writeText(walletItem.address);
        vscode.window.showInformationMessage('Address copied to clipboard.');
    });

    // Register the 'mark commit' command
    registerMarkCommitCommand(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
