import * as vscode from 'vscode';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { CHRONIK_ENDPOINTS } from '../constants/chronikEndpoints';
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

const chronik = new ChronikClient(CHRONIK_ENDPOINTS);

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
                // Validate required config values
                const config = vscode.workspace.getConfiguration('gitmark-ecash');
                let fundingWif = config.get("fundingWif") as string;
                let destinationAddress = config.get("destinationAddress") as string;
                let changeAddress = config.get("changeAddress") as string;
                if (!fundingWif || !destinationAddress || !changeAddress) {
                    fundingWif = '';
                    destinationAddress = selectedWallet.address;
                    changeAddress = selectedWallet.address;
                    await config.update('fundingWif', fundingWif, vscode.ConfigurationTarget.Workspace);
                    await config.update('destinationAddress', destinationAddress, vscode.ConfigurationTarget.Workspace);
                    await config.update('changeAddress', changeAddress, vscode.ConfigurationTarget.Workspace);
                    // Re-fetch config values after update
                    fundingWif = config.get("fundingWif") as string;
                    destinationAddress = config.get("destinationAddress") as string;
                    changeAddress = config.get("changeAddress") as string;
                }
                const seed = await context.secrets.get(selectedWallet.address);
                if (!seed) {
                    throw new Error(`Could not retrieve seed for ${selectedWallet.name}. Please re-import the wallet.`);
                }
                const wallet = await Wallet.fromMnemonic(seed, chronik);
                // Minimum balance check: 42.00 XEC (4200 sats)
                const utxosResult = await chronik.address(selectedWallet.address).utxos();
                console.log('Wallet UTXOs:', utxosResult.utxos);
                let spendableUtxos: any[] = [];
                let balance = 0n;
                if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                    spendableUtxos = utxosResult.utxos
                        .filter((utxo: any) => utxo.isFinal && !utxo.isCoinbase)
                        .map((utxo: any) => {
                            let sats = utxo.sats;
                            let satsAsBigInt = 0n;
                            if (typeof sats === 'bigint') {
                                satsAsBigInt = sats;
                            } else if (typeof sats === 'string') {
                                const match = sats.match(/\d+/);
                                if (match) {
                                    satsAsBigInt = BigInt(match[0]);
                                }
                            } else if (typeof sats === 'number') {
                                satsAsBigInt = BigInt(sats);
                            }
                            return {
                                txid: utxo.outpoint.txid,
                                vout: utxo.outpoint.outIdx ?? utxo.out_idx,
                                sats: satsAsBigInt,
                                script: new Script(Buffer.from(utxo.outputScript, 'hex')),
                                height: utxo.blockHeight ?? 0
                            };
                        });
                    balance = spendableUtxos.reduce((acc: bigint, utxo: any) => acc + utxo.sats, 0n);
                }
                console.log('Spendable UTXOs:', spendableUtxos);
                console.log('Wallet balance (sats):', balance.toString());
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
                        ],
                        inputs: spendableUtxos.map(utxo => ({
                            txid: utxo.txid,
                            vout: utxo.vout,
                            value: Number(utxo.sats),
                            script: utxo.script,
                            height: utxo.height
                        }))
                    };
                console.log('Transaction action:', action);
                try {
                    const walletAction = wallet.action(action);
                    const builtTx = walletAction.build();
                    console.log('Built transaction:', builtTx);
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
                } catch (txError: any) {
                    console.error('Transaction build/broadcast error:', txError);
                    vscode.window.showErrorMessage(`Gitmark failed: ${txError.message || txError}`);
                }
            } catch (error: any) {
                console.error('General error:', error);
                vscode.window.showErrorMessage(`Gitmark failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(markCommitCommand);
}