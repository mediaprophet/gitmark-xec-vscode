import * as vscode from 'vscode';
import * as bip39 from 'bip39';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { CHRONIK_ENDPOINTS } from './constants/chronikEndpoints';
import { WalletTreeDataProvider, registerWalletTxHistoryCommand } from './tree/WalletTreeDataProvider';
import { CommitHistoryProvider } from './tree/CommitHistoryProvider';
import { registerMarkCommitCommand } from './commands/markCommit';

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

// --- NEW FUNCTION TO CONTROL BUTTON STATE ---
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

    const walletTreeDataProvider = new WalletTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('walletsTreeView', walletTreeDataProvider);

    const commitHistoryProvider = new CommitHistoryProvider(context);
    vscode.window.registerTreeDataProvider('commitHistoryView', commitHistoryProvider);
    
    // --- REGISTER COMMANDS ---
    context.subscriptions.push(
        vscode.commands.registerCommand('gitmark-ecash.selectWallet', async (walletItem: { address: string; label: string }) => {
            if (!walletItem || !walletItem.address) return;
            await context.globalState.update('gitmark-ecash.selectedWallet', walletItem.label);
            vscode.window.showInformationMessage(`Selected wallet: ${walletItem.label}`);
            walletTreeDataProvider.refresh();
            await updateMarkButtonState(context); // Update button on selection
        }),

        vscode.commands.registerCommand('gitmark-ecash.refreshWallets', async () => {
            walletTreeDataProvider.refresh();
            commitHistoryProvider.refresh();
            await updateMarkButtonState(context); // Update button on refresh
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
        // ... other command registrations ...
    );

    registerMarkCommitCommand(context, commitHistoryProvider);
    registerWalletTxHistoryCommand(context, walletTreeDataProvider);
    
    // --- SET UP LISTENERS TO UPDATE BUTTON STATE ---
    // Listen for changes in the Git repository (e.g., new commits)
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
