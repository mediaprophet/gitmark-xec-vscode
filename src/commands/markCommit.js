const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');
const { ElectrumWallet, sendBch, getOpReturnData } = require('ecash-lib');

const chronik = new ChronikClient('https://chronik.be.cash/xec');

function registerMarkCommitCommand(context) {
    let markCommitCommand = vscode.commands.registerCommand('gitmark-ecash.markCommit', async function () {
        const gitExtension = vscode.extensions.getExtension('vscode.git').exports;
        const api = gitExtension.getAPI(1);

        if (api.repositories.length === 0) {
            vscode.window.showErrorMessage('No Git repository found.');
            return;
        }

        const repo = api.repositories[0];
        const head = repo.state.HEAD;

        if (!head || !head.commit) {
            vscode.window.showErrorMessage('No commits found in this repository.');
            return;
        }

        const commitHash = head.commit;

        const wallets = context.globalState.get('gitmark-ecash.wallets', []);
        const selectedWalletName = context.globalState.get('gitmark-ecash.selectedWallet');
        const selectedWallet = wallets.find(w => w.name === selectedWalletName);

        if (!selectedWallet) {
            vscode.window.showErrorMessage('No wallet selected. Please select a wallet from the Gitmark view.');
            return;
        }

        const wallet = await ElectrumWallet.fromMnemonic(selectedWallet.seed);
        const address = wallet.getDepositAddress();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Gitmarking commit...",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: `Marking commit ${commitHash.substring(0, 12)}...` });
                
                progress.report({ message: "Fetching UTXOs..." });
                const utxosResult = await chronik.address(address).utxos();
                 if (!utxosResult.utxos || utxosResult.utxos.length === 0) {
                    throw new Error(`No UTXOs found for address ${address}. Please fund this address.`);
                }
                const availableUtxos = utxosResult.utxos;

                const opReturnData = getOpReturnData(commitHash);

                progress.report({ message: "Constructing transaction..." });
                const targets = [ opReturnData, { address: address, value: 0 } ];

                progress.report({ message: "Broadcasting to eCash network..." });
                const { txid } = await sendBch(chronik, wallet, availableUtxos, targets);

                const successMsg = `Commit ${commitHash.substring(0, 12)} marked successfully!`;
                vscode.window.showInformationMessage(successMsg, 'View on Block Explorer').then(selection => {
                    if (selection === 'View on Block Explorer') {
                        vscode.env.openExternal(vscode.Uri.parse(`https://explorer.e.cash/tx/${txid}`));
                    }
                });

            } catch (error) {
                console.error(error);
                vscode.window.showErrorMessage(`Gitmark failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(markCommitCommand);
}

module.exports = { registerMarkCommitCommand };
