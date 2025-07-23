import * as vscode from 'vscode';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { Script } from 'ecash-lib';
import { CommitHistoryProvider, MarkedCommit } from '../tree/CommitHistoryProvider';
import { getOrSelectWallet } from '../utils/walletSelection';

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

const chronik = new ChronikClient(['https://chronik.be.cash/xec']);

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

        const selectedWallet = await getOrSelectWallet(context);
        if (!selectedWallet) {
            return;
        }
        vscode.window.showInformationMessage(`Selected wallet: ${selectedWallet.name} (${selectedWallet.address})`);

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
                // Minimum balance check: 42.00 XEC (4200 sats)
                const utxosResult = await chronik.address(selectedWallet.address).utxos();
                let balance = 0n;
                if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                    balance = utxosResult.utxos.reduce((acc: bigint, utxo: any) => {
                        const v = BigInt((utxo.value ?? utxo.sats) ?? 0);
                        return acc + v;
                    }, 0n);
                }
                const minSats = 4200n;
                if (balance < minSats) {
                    vscode.window.showErrorMessage(`Insufficient balance. Wallet must have more than 42.00 XEC to mark a commit. Current balance: ${(Number(balance) / 100).toFixed(2)} XEC.`);
                    return;
                }
                progress.report({ message: `Marking commit ${commitHash.substring(0, 12)}...` });
                const opReturnHex = '6d02' + Buffer.from(commitHash, 'utf8').toString('hex');
                const action = {
                    outputs: [
                        {
                            sats: 0n,
                            script: new Script(Buffer.from('6a' + opReturnHex, 'hex'))
                        }
                    ]
                };
                const walletAction = wallet.action(action);
                const builtTx = walletAction.build();
                progress.report({ message: "Broadcasting to eCash network..." });
                const txidObj = await builtTx.broadcast();
                const txid = String(txidObj.txid);
                const history = context.globalState.get<MarkedCommit[]>('gitmark-ecash.commitHistory', []);
                history.push({
                    commitHash: commitHash,
                    txid: txid,
                    timestamp: Date.now()
                });
                await context.globalState.update('gitmark-ecash.commitHistory', history);
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