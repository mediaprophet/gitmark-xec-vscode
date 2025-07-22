import * as vscode from 'vscode';
import * as bip39 from 'bip39';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { WalletTreeDataProvider } from './tree/WalletTreeDataProvider';
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

        vscode.commands.registerCommand('gitmark-ecash.copyAddress', (walletItem: { address: string }) => {
            vscode.env.clipboard.writeText(walletItem.address);
            vscode.window.showInformationMessage('Address copied to clipboard.');
        }),

        vscode.commands.registerCommand('gitmark-ecash.viewOnExplorer', (txid: string) => {
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

    // Call the function from the command module to register the markCommit command
    registerMarkCommitCommand(context, commitHistoryProvider);
}

export function deactivate() {}