const vscode = require('vscode');
const { Wallet } = require('ecash-wallet');

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
        const selectedWalletName = context.globalState.get('gitmark-ecash.selectedWallet'); // Assuming you store the selected wallet name
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
                // Get the seed from SecretStorage using the wallet's address as the key
                const seed = await context.secrets.get(selectedWallet.address);
                if (!seed) {
                    throw new Error(`Could not retrieve seed for ${selectedWallet.name}. Please re-import the wallet.`);
                }
                
                // Create a wallet instance from the retrieved seed
                const wallet = await Wallet.fromMnemonic(seed);

                progress.report({ message: `Marking commit ${commitHash.substring(0, 12)}...` });
                
                // Construct the OP_RETURN output using the format required by ecash-wallet
                const opReturnHex = '6d02' + Buffer.from(commitHash, 'utf8').toString('hex');
                const outputs = [{ opreturn: opReturnHex }];

                progress.report({ message: "Broadcasting to eCash network..." });
                
                // The wallet.send() method handles UTXO selection, fee calculation, and change output automatically
                const { txid } = await wallet.send(outputs);

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
