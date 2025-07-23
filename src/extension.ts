import * as vscode from 'vscode';
import * as bip39 from 'bip39';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { CHRONIK_ENDPOINTS } from './constants/chronikEndpoints';
import { WalletTreeDataProvider, registerWalletTxHistoryCommand } from './tree/WalletTreeDataProvider';
import { CommitHistoryProvider } from './tree/CommitHistoryProvider';
import { registerMarkCommitCommand } from './commands/markCommit';
import { showWalletQrCode } from './commands/showQrCode';

// Define GitExtension interface
interface GitExtension {
    getAPI(version: 1): {
        repositories: {
            state: {
                HEAD?: { commit?: string };
                onDidChange: vscode.Event<void>;
            };
        }[];
    };
}

const chronik = new ChronikClient(CHRONIK_ENDPOINTS);

// --- FUNCTION TO CONTROL BUTTON STATE ---
async function updateMarkButtonState(context: vscode.ExtensionContext) {
    console.log('[DEBUG] Updating mark button state...');
    
    // 1. Check for a valid commit
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
    if (!gitExtension) {
        vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'amber');
        return;
    }
    const repo = gitExtension.getAPI(1).repositories[0];
    const commitHash = repo?.state.HEAD?.commit;

    if (!commitHash) {
        console.log('[DEBUG] No HEAD commit found. State: AMBER');
        vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'amber');
        return;
    }

    // 2. Check for a selected wallet and its balance
    const selectedWalletName = context.globalState.get<string>('gitmark-ecash.selectedWallet');
    const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
    const selectedWallet = wallets.find(w => w.name === selectedWalletName);

    if (!selectedWallet) {
        console.log('[DEBUG] No wallet selected. State: RED');
        vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'red');
        return;
    }

    try {
        const utxosResponse = await chronik.address(selectedWallet.address).utxos();
        const rawUtxos = utxosResponse.utxos || [];
        
        const totalBalance = rawUtxos.reduce((acc, utxo) => {
            const satsValue = (utxo as any).sats;
            if (typeof satsValue === 'bigint') {
                return acc + satsValue;
            }
            if (typeof satsValue === 'number') {
                return acc + BigInt(satsValue);
            }
            if (typeof satsValue === 'string') {
                const match = satsValue.match(/\d+/);
                if (match) {
                    return acc + BigInt(match[0]);
                }
            }
            return acc;
        }, 0n);

        const requiredBalance = 1546n; // Minimum required for a tx
        if (totalBalance >= requiredBalance) {
            console.log(`[DEBUG] Sufficient balance (${totalBalance}). State: GREEN`);
            vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'green');
        } else {
            console.log(`[DEBUG] Insufficient balance (${totalBalance}). State: RED`);
            vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'red');
        }
    } catch (error) {
        console.error('[DEBUG] Error fetching balance for button state:', error);
        vscode.commands.executeCommand('setContext', 'gitmark.markButtonState', 'red');
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Gitmark eCash extension activating...');

    // WASM load check for wallet library
    try {
        if (typeof Wallet.fromMnemonic !== 'function') {
            throw new Error('Wallet.fromMnemonic is not a function. Wallet library may have failed to load.');
        }
    } catch (err) {
        console.error('Error loading wallet library or WASM:', err);
        vscode.window.showErrorMessage('Failed to load wallet library or WASM: ' + (err && err.toString ? err.toString() : String(err)));
    }

    // --- SETUP TREE PROVIDERS ---
    const walletTreeDataProvider = new WalletTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('walletsTreeView', walletTreeDataProvider);

    const commitHistoryProvider = new CommitHistoryProvider(context);
    vscode.window.registerTreeDataProvider('commitHistoryView', commitHistoryProvider);

    // --- REGISTER COMMANDS ---
    context.subscriptions.push(
        vscode.commands.registerCommand('gitmark-ecash.selectWallet', async (walletItem: { address: string; label: string }) => {
            console.log('Command executed: gitmark-ecash.selectWallet', walletItem);
            if (!walletItem || !walletItem.address) {
                vscode.window.showErrorMessage('No wallet selected.');
                return;
            }
            await context.globalState.update('gitmark-ecash.selectedWallet', walletItem.label);
            // Update config values for fundingWif, destinationAddress, and changeAddress
            const config = vscode.workspace.getConfiguration('gitmark-ecash');
            await config.update('fundingWif', '', vscode.ConfigurationTarget.Workspace);
            await config.update('destinationAddress', walletItem.address, vscode.ConfigurationTarget.Workspace);
            await config.update('changeAddress', walletItem.address, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Selected wallet: ${walletItem.label}`);
            walletTreeDataProvider.refresh();
            await updateMarkButtonState(context); // Update button on selection
        }),

        vscode.commands.registerCommand('gitmark-ecash.renameWallet', async (walletItem: { address: string; label: string }) => {
            console.log('Command executed: gitmark-ecash.renameWallet', walletItem);
            if (!walletItem || !walletItem.address) {
                vscode.window.showErrorMessage('No wallet selected. Please select a wallet to rename.');
                return;
            }
            const newName = await vscode.window.showInputBox({ prompt: `Enter new name for wallet (${walletItem.label})`, value: walletItem.label });
            if (!newName || newName.trim() === '') {
                vscode.window.showWarningMessage('Wallet name cannot be empty.');
                return;
            }
            const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
            const idx = wallets.findIndex(w => w.address === walletItem.address);
            if (idx === -1) {
                vscode.window.showErrorMessage('Wallet not found.');
                return;
            }
            wallets[idx].name = newName.trim();
            await context.globalState.update('gitmark-ecash.wallets', wallets);
            vscode.window.showInformationMessage(`Wallet renamed to: ${newName.trim()}`);
            walletTreeDataProvider.refresh();
        }),

        vscode.commands.registerCommand('gitmark-ecash.refreshWallets', async () => {
            console.log('Command executed: gitmark-ecash.refreshWallets');
            walletTreeDataProvider.refresh();
            commitHistoryProvider.refresh();
            await updateMarkButtonState(context); // Update button on refresh
        }),

        vscode.commands.registerCommand('gitmark-ecash.createWallet', async () => {
            console.log('Command executed: gitmark-ecash.createWallet');
            try {
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
            } catch (err) {
                console.error('Error in createWallet:', err);
                vscode.window.showErrorMessage('Failed to create wallet: ' + (typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : String(err)));
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.importWallet', async () => {
            console.log('Command executed: gitmark-ecash.importWallet');
            try {
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
                vscode.window.showInformationMessage(`Imported wallet: ${name}`);
            } catch (err) {
                console.error('Error in importWallet:', err);
                vscode.window.showErrorMessage('Failed to import wallet: ' + (typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : String(err)));
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.removeWallet', async (walletItem: { address: string; label: string }) => {
            console.log('Command executed: gitmark-ecash.removeWallet', walletItem);
            const confirm = await vscode.window.showWarningMessage(`Remove ${walletItem.label}?`, { modal: true }, 'Yes');
            if (confirm === 'Yes') {
                let wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
                wallets = wallets.filter(w => w.address !== walletItem.address);
                await context.globalState.update('gitmark-ecash.wallets', wallets);
                await context.secrets.delete(walletItem.address);
                walletTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Removed wallet: ${walletItem.label}`);
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.copyAddress', (item: any) => {
            console.log('Command executed: gitmark-ecash.copyAddress', item);
            let address = '';
            let label = 'Address copied to clipboard.';
            if (item.contextValue === 'transaction') {
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
            console.log('Command executed: gitmark-ecash.viewOnExplorer', arg);
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
            console.log('Command executed: gitmark-ecash.showSeed', walletItem);
            const seed = await context.secrets.get(walletItem.address);
            if (seed) {
                vscode.window.showInformationMessage(
                    `Seed for ${walletItem.label}: ${seed}`,
                    { modal: true, detail: 'Warning: Never share your seed phrase with anyone.' }
                );
            } else {
                vscode.window.showErrorMessage(`Could not retrieve seed for ${walletItem.label}.`);
            }
        }),

        vscode.commands.registerCommand('gitmark-ecash.showQrCode', async (walletItem: { address: string; label: string }) => {
            console.log('Command executed: gitmark-ecash.showQrCode', walletItem);
            await showWalletQrCode(walletItem);
        })
    );

    registerMarkCommitCommand(context, commitHistoryProvider);
    console.log('Registered mark commit command.');
    registerWalletTxHistoryCommand(context, walletTreeDataProvider);
    console.log('Registered wallet transaction history command.');

    // --- SET UP LISTENERS TO UPDATE BUTTON STATE ---
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
    if (gitExtension) {
        const repo = gitExtension.getAPI(1).repositories[0];
        if (repo) {
            repo.state.onDidChange(() => {
                console.log('[DEBUG] Git state changed, updating button state.');
                updateMarkButtonState(context);
            });
        }
    }

    // Initial update when the extension activates
    updateMarkButtonState(context);

    vscode.window.showInformationMessage('Gitmark eCash extension activated.');
}

export function deactivate() {}