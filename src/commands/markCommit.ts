import * as vscode from 'vscode';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { CommitHistoryProvider, MarkedCommit } from '../tree/CommitHistoryProvider';

// Define a minimal interface for the Git API to provide some type safety
interface GitExtension {
    getAPI(version: 1): {
        repositories: {
            state: {
                HEAD?: {
                    commit?: string;
                };
            };
        }[];
    };
}

// Instantiate the Chronik client once to be reused.
const chronik = new ChronikClient(['https://chronik.be.cash/xec']);

/**
 * Registers the command to mark a commit.
 * @param context The extension context.
 * @param commitHistoryProvider The provider for the commit history view, used to refresh it.
 */
export function registerMarkCommitCommand(context: vscode.ExtensionContext, commitHistoryProvider: CommitHistoryProvider) {
    const markCommitCommand = vscode.commands.registerCommand('gitmark-ecash.markCommit', async () => {
        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
        if (!gitExtension) {
            vscode.window.showErrorMessage('Could not get Git extension API.');
            return;
        }
        const api = gitExtension.getAPI(1);

        if (api.repositories.length === 0) {
            vscode.window.showErrorMessage('No Git repository found.');
            return;
        }

        const repo = api.repositories[0];
        const commitHash = repo.state.HEAD?.commit;

        if (!commitHash) {
            vscode.window.showErrorMessage('No commits found in this repository.');
            return;
        }

        const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
        const selectedWalletName = context.globalState.get<string>('gitmark-ecash.selectedWallet');
        const selectedWallet = wallets.find(w => w.name === selectedWalletName);

        if (!selectedWallet) {
            vscode.window.showErrorMessage('No wallet selected. Please select a wallet from the Gitmark view.');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Gitmarking commit...",
            cancellable: false
        }, async (progress) => {
            try {
                const seed = await context.secrets.get(selectedWallet.address);
                if (!seed) {
                    throw new Error(`Could not retrieve seed for ${selectedWallet.name}. Please re-import the wallet.`);
                }
                
                const wallet = await Wallet.fromMnemonic(seed, chronik);

                progress.report({ message: `Marking commit ${commitHash.substring(0, 12)}...` });
                
                const opReturnHex = '6d02' + Buffer.from(commitHash, 'utf8').toString('hex');
                const outputs = [{ opreturn: opReturnHex }];

                progress.report({ message: "Broadcasting to eCash network..." });
                
                // FIX: Use the correct method to broadcast the transaction.
                const txid = await wallet.send(outputs);

                // --- Add to Commit History ---
                const history = context.globalState.get<MarkedCommit[]>('gitmark-ecash.commitHistory', []);
                history.push({
                    commitHash: commitHash,
                    txid: txid,
                    timestamp: Date.now()
                });
                await context.globalState.update('gitmark-ecash.commitHistory', history);

                // --- Refresh the UI ---
                commitHistoryProvider.refresh();

                const successMsg = `Commit ${commitHash.substring(0, 12)} marked successfully!`;
                vscode.window.showInformationMessage(successMsg, 'View on Block Explorer').then(selection => {
                    if (selection === 'View on Block Explorer') {
                        vscode.env.openExternal(vscode.Uri.parse(`https://explorer.e.cash/tx/${txid}`));
                    }
                });

            } catch (error: any) {
                console.error(error);
                vscode.window.showErrorMessage(`Gitmark failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(markCommitCommand);
}