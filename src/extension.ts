import * as vscode from 'vscode';
import * as bip39 from 'bip39';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
// FIX: Import from the .ts files without the file extension.
import { WalletTreeDataProvider } from './tree/WalletTreeDataProvider';
import { registerWalletTxHistoryCommand } from './tree/WalletTreeDataProvider';
import { CommitHistoryProvider } from './tree/CommitHistoryProvider';
import { registerMarkCommitCommand } from './commands/markCommit';

const chronik = new ChronikClient(['https://chronik.be.cash/xec']);

export function activate(context: vscode.ExtensionContext) {
    // --- SETUP TREE PROVIDERS ---
    const walletTreeDataProvider = new WalletTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('walletsTreeView', walletTreeDataProvider);

    const commitHistoryProvider = new CommitHistoryProvider(context);
    vscode.window.registerTreeDataProvider('commitHistoryView', commitHistoryProvider);

    // --- REGISTER COMMANDS ---
    context.subscriptions.push(
        vscode.commands.registerCommand('gitmark-ecash.refreshWallets', () => {
            walletTreeDataProvider.refresh();
            commitHistoryProvider.refresh();
        }),

        vscode.commands.registerCommand('gitmark-ecash.createWallet', async () => {
            const seed = bip39.generateMnemonic();
            const wallet = await Wallet.fromMnemonic(seed, chronik);
            const address = wallet.address;
            
            const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
            const name = `Wallet ${wallets.length + 1}`;

            wallets.push({ name, address });
            await context.globalState.update('gitmark-ecash.wallets', wallets);
            await context.secrets.store(address, seed);

            walletTreeDataProvider.refresh();
            vscode.window.showInformationMessage(`Created and saved: ${name}`);
        }),

        vscode.commands.registerCommand('gitmark-ecash.importWallet', async () => {
            const seed = await vscode.window.showInputBox({ prompt: 'Enter your 12-word seed phrase.' });

            if (!seed || !bip39.validateMnemonic(seed)) {
                vscode.window.showErrorMessage('Invalid or empty seed phrase.');
                return;
            }
            
            const wallet = await Wallet.fromMnemonic(seed, chronik);
            const address = wallet.address;
            const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);

            if (wallets.find(w => w.address === address)) {
                vscode.window.showWarningMessage('This wallet has already been imported.');
                return;
            }

            const name = `Wallet ${wallets.length + 1}`;
            wallets.push({ name, address });
            await context.globalState.update('gitmark-ecash.wallets', wallets);
            await context.secrets.store(address, seed);

            walletTreeDataProvider.refresh();
        }),

        vscode.commands.registerCommand('gitmark-ecash.removeWallet', async (walletItem: { address: string; label: string }) => {
            const confirm = await vscode.window.showWarningMessage(`Remove ${walletItem.label}?`, { modal: true }, 'Yes');
            if (confirm === 'Yes') {
                let wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
                wallets = wallets.filter(w => w.address !== walletItem.address);
                await context.globalState.update('gitmark-ecash.wallets', wallets);
                await context.secrets.delete(walletItem.address);
                walletTreeDataProvider.refresh();
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.copyAddress', (item: any) => {
            let address = '';
            let label = 'Address copied to clipboard.';
            if (item.contextValue === 'transaction') {
                // Determine direction from description
                if (item.description && item.description.startsWith('from')) {
                    label = 'Sender address copied to clipboard.';
                } else if (item.description && item.description.startsWith('to')) {
                    label = 'Receiver address copied to clipboard.';
                }
                address = item.txAddress || '';
            } else {
                address = item.address || '';
            }
            if (address) {
                vscode.env.clipboard.writeText(address);
                vscode.window.showInformationMessage(label);
            } else {
                vscode.window.showWarningMessage('No address found to copy.');
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.viewOnExplorer', (arg: any) => {
            let txid = '';
            if (typeof arg === 'string') {
                txid = arg;
            } else if (arg && typeof arg.txid === 'string') {
                txid = arg.txid;
            }
            if (txid) {
                vscode.env.openExternal(vscode.Uri.parse(`https://explorer.e.cash/tx/${txid}`));
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.showSeed', async (walletItem: { address: string; label: string }) => {
            const seed = await context.secrets.get(walletItem.address);
            if (seed) {
                vscode.window.showInformationMessage(
                    `Seed for ${walletItem.label}: ${seed}`,
                    { modal: true, detail: 'Warning: Never share your seed phrase with anyone.' }
                );
            } else {
                vscode.window.showErrorMessage(`Could not retrieve seed for ${walletItem.label}.`);
            }
        })
    );

    registerMarkCommitCommand(context, commitHistoryProvider);
    // Register wallet transaction history command
    registerWalletTxHistoryCommand(context, walletTreeDataProvider);
}

export function deactivate() {}
