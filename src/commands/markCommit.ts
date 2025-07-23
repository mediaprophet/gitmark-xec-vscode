import * as vscode from 'vscode';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import { Script } from 'ecash-lib';
import { CommitHistoryProvider } from '../tree/CommitHistoryProvider';
import { CHRONIK_ENDPOINTS } from '../constants/chronikEndpoints';
import { GitExtension } from '../types';

const chronik = new ChronikClient(CHRONIK_ENDPOINTS);

type MarkedCommits = { [commitHash: string]: string };

export function registerMarkCommitCommand(
    context: vscode.ExtensionContext,
    commitHistoryProvider: CommitHistoryProvider
) {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitmark-ecash.markCommit', async () => {
            console.log('[DEBUG] "markCommit" command triggered.');

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Marking Git Commit...',
                cancellable: false
            }, async (progress) => {
                try {
                    // 1. Get the latest commit hash
                    progress.report({ message: "Getting latest commit..." });
                    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
                    if (!gitExtension) throw new Error('Git extension is not available.');
                    
                    const repo = gitExtension.getAPI(1).repositories[0];
                    if (!repo) throw new Error('No Git repository found.');

                    const commitHash = repo.state.HEAD?.commit;
                    if (!commitHash) throw new Error('No HEAD commit found.');
                    console.log(`[DEBUG] Found HEAD commit: ${commitHash}`);

                    // 2. Get the selected wallet
                    progress.report({ message: "Accessing wallet..." });
                    const selectedWalletName = context.globalState.get<string>('gitmark-ecash.selectedWallet');
                    if (!selectedWalletName) throw new Error('No wallet selected.');
                    
                    const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
                    const walletInfo = wallets.find(w => w.name === selectedWalletName);
                    if (!walletInfo) throw new Error('Selected wallet not found.');
                    console.log(`[DEBUG] Using wallet: ${walletInfo.name} (${walletInfo.address})`);

                    // 3. Get the seed phrase and initialize the wallet
                    const seed = await context.secrets.get(walletInfo.address);
                    if (!seed) throw new Error('Could not retrieve seed phrase.');
                    
                    const wallet = await Wallet.fromMnemonic(seed, chronik);
                    console.log('[DEBUG] Wallet object initialized successfully.');

                    // 4. Fetch UTXOs and calculate balance
                    progress.report({ message: "Fetching balance..." });
                    const utxosResponse = await chronik.address(walletInfo.address).utxos();
                    const rawUtxos = utxosResponse.utxos || [];
                    console.log(`[DEBUG] Found ${rawUtxos.length} raw UTXOs.`);

                    // 5. Filter for spendable UTXOs and map to the correct format
                    const spendableUtxos = rawUtxos
                        .filter(utxo => utxo.isFinal && !utxo.isCoinbase)
                        .map(utxo => ({
                            txid: utxo.outpoint.txid,
                            vout: utxo.outpoint.outIdx,
                            sats: BigInt(utxo.sats)
                            // no need for wif per input unless your wallet API requires it
                        }));

                    const totalBalance = spendableUtxos.reduce((acc, utxo) => acc + utxo.sats, 0n);
                    console.log(`[DEBUG] Total calculated balance from spendable UTXOs: ${totalBalance} sats.`);

                    // 6. Verify the balance is sufficient
                    const fee = 1000n;
                    if (totalBalance < fee) {
                        throw new Error(`Insufficient balance. You need at least ${fee} sats, but only have ${totalBalance}.`);
                    }

                    // 7. Build the transaction
                    progress.report({ message: "Building transaction..." });
                    const opReturnData = `gitmark:${commitHash}`;
                    const opReturnScript = Script.buildOpReturn([Buffer.from(opReturnData, 'utf8')]);

                    // Optional: add change output if needed
                    const outputs = [
                        { sats: 0n, script: opReturnScript }
                    ];
                    if (totalBalance > fee) {
                        outputs.push({
                            sats: totalBalance - fee,
                            script: Script.fromAddress(walletInfo.address) // or use outputScript from UTXOs
                        });
                    }

                    const action = {
                        inputs: spendableUtxos,
                        outputs,
                        fee: Number(fee),
                    };

                    const rawTx = wallet.action(action).build();
                    // If rawTx is a Buffer, convert to hex
                    const txHex = Buffer.isBuffer(rawTx) ? rawTx.toString('hex') : rawTx;

                    // 8. Broadcast the transaction
                    progress.report({ message: "Broadcasting transaction..." });
                    const { txid } = await chronik.broadcastTx(txHex);

                    if (!txid) {
                        throw new Error('Transaction failed to broadcast.');
                    }
                    console.log(`[DEBUG] Transaction broadcasted successfully. TXID: ${txid}`);

                    // 9. Update history and notify user
                    const markedCommits =
                        context.globalState.get<MarkedCommits>('gitmark-ecash.markedCommits', {}) || {};
                    markedCommits[commitHash] = txid;
                    await context.globalState.update('gitmark-ecash.markedCommits', markedCommits);

                    commitHistoryProvider.refresh();
                    vscode.window.showInformationMessage(
                        `Successfully marked commit ${commitHash.substring(0, 12)} with txid: ${txid}`
                    );
                } catch (err: any) {
                    console.error('[DEBUG] An error occurred during the Gitmark process:', err);
                    vscode.window.showErrorMessage(`Gitmark Failed: ${err.message}`);
                }
            });
        })
    );
}
