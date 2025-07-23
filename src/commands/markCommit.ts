import * as vscode from 'vscode';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { CHRONIK_ENDPOINTS } from '../constants/chronikEndpoints';
import { Script } from 'ecash-lib';
import { CommitHistoryProvider, MarkedCommit } from '../tree/CommitHistoryProvider';
import { getOrSelectWallet } from '../utils/walletSelection';

// Define the structure for the Git Extension API
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

// Initialize the Chronik client
const chronik = new ChronikClient(CHRONIK_ENDPOINTS);

/**
 * Registers the command to mark a Git commit on the eCash blockchain.
 */
export function registerMarkCommitCommand(context: vscode.ExtensionContext, commitHistoryProvider: CommitHistoryProvider) {
    const markCommitCommand = vscode.commands.registerCommand('gitmark-ecash.markCommit', async () => {
        console.log('[DEBUG] "markCommit" command triggered.');

        // --- 1. Get the latest Git commit hash ---
        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
        if (!gitExtension) {
            vscode.window.showErrorMessage('Could not find the official Git extension. Please ensure it is installed and enabled.');
            return;
        }
        const repo = gitExtension.getAPI(1).repositories[0];
        const commitHash = repo?.state.HEAD?.commit;
        if (!commitHash) {
            vscode.window.showErrorMessage('No commits found. Please make a commit before running Gitmark.');
            return;
        }
        console.log(`[DEBUG] Found HEAD commit: ${commitHash}`);

        // --- 2. Get the user's selected wallet ---
        const selectedWallet = await getOrSelectWallet(context);
        if (!selectedWallet) {
            return;
        }
        console.log(`[DEBUG] Using wallet: ${selectedWallet.name} (${selectedWallet.address})`);

        // --- 3. Execute the marking process with a progress indicator ---
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Gitmarking Commit...",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: "Accessing wallet..." });

                // --- 4. Load the wallet's seed from VS Code secrets ---
                const seed = await context.secrets.get(selectedWallet.address);
                if (!seed) {
                    throw new Error(`Could not retrieve credentials for ${selectedWallet.name}. Please re-import the wallet.`);
                }
                const wallet = await Wallet.fromMnemonic(seed, chronik);
                console.log('[DEBUG] Wallet object initialized successfully.');

                // --- 5. Fetch UTXOs from the wallet address ---
                progress.report({ message: "Fetching balance from network..." });
                const utxosResponse = await chronik.address(selectedWallet.address).utxos();
                const rawUtxos = utxosResponse.utxos || [];
                const outputScriptHex = utxosResponse.outputScript; 
                
                console.log(`[DEBUG] Found ${rawUtxos.length} raw UTXOs.`);
                if (!outputScriptHex) {
                    throw new Error("Could not retrieve a valid output script for the wallet's UTXOs.");
                }

                // --- 6. Process UTXOs and calculate total balance ---
                const spendableUtxos = rawUtxos
                    .filter(utxo => utxo.isFinal && !utxo.isCoinbase)
                    .map(utxo => {
                        let satsAsBigInt = 0n;
                        const satsValue = (utxo as any).sats;
                        if (typeof satsValue === 'bigint') {
                            satsAsBigInt = satsValue;
                        } else if (typeof satsValue === 'string') {
                            const match = satsValue.match(/\d+/);
                            if (match) {
                                satsAsBigInt = BigInt(match[0]);
                            }
                        } else if (typeof satsValue === 'number') {
                            satsAsBigInt = BigInt(satsValue);
                        }
                        return {
                            txid: utxo.outpoint.txid,
                            vout: utxo.outpoint.outIdx,
                            sats: satsAsBigInt,
                            script: new Script(Buffer.from(outputScriptHex, 'hex')),
                            height: utxo.blockHeight ?? 0
                        };
                    });

                const totalBalance = spendableUtxos.reduce((acc, utxo) => acc + utxo.sats, 0n);
                console.log(`[DEBUG] Total calculated balance: ${totalBalance} sats.`);

                // --- 7. Verify the balance is sufficient ---
                const totalCost = 1546n; // 546 sats dust + 1000 sats fee
                if (totalBalance < totalCost) {
                    throw new Error(`Insufficient balance. You need at least ${Number(totalCost)} sats, but only have ${totalBalance}.`);
                }

                // --- 8. Build and broadcast the transaction ---
                progress.report({ message: "Building transaction..." });
                const opReturnHex = '6d02' + Buffer.from(commitHash, 'utf8').toString('hex');
                const action = {
                    outputs: [{
                        sats: 0n,
                        script: new Script(Buffer.from('6a' + opReturnHex, 'hex'))
                    }],
                    inputs: spendableUtxos.map(utxo => ({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        // ** THE FINAL FIX IS HERE: Use 'sats' instead of 'value' **
                        sats: utxo.sats, 
                        script: utxo.script,
                        height: utxo.height
                    }))
                };

                const builtTx = wallet.action(action).build();
                console.log('[DEBUG] Transaction built successfully.');

                progress.report({ message: "Broadcasting to network..." });
                const { txid } = await builtTx.broadcast();
                console.log(`[DEBUG] Broadcast successful. TxId: ${txid}`);

                // --- 9. Save the result and notify the user ---
                const history = context.globalState.get<MarkedCommit[]>('gitmark-ecash.commitHistory', []);
                history.push({ commitHash, txid, timestamp: Date.now() });
                await context.globalState.update('gitmark-ecash.commitHistory', history);
                commitHistoryProvider.refresh();

                const successMsg = `Commit ${commitHash.substring(0, 12)} marked!`;
                vscode.window.showInformationMessage(successMsg, 'View on Block Explorer').then(selection => {
                    if (selection === 'View on Block Explorer') {
                        vscode.env.openExternal(vscode.Uri.parse(`https://explorer.e.cash/tx/${txid}`));
                    }
                });

            } catch (error: any) {
                console.error('[DEBUG] An error occurred during the Gitmark process:', error);
                vscode.window.showErrorMessage(`Gitmark Failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(markCommitCommand);
}