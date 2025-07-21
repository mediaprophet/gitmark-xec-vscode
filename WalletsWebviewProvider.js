const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');
const bip39 = require('bip39');
const { HdNode, mnemonicToSeed, Ecc, shaRmd160 } = require('ecash-lib');
const ecashaddr = require('ecashaddrjs');

// Instantiate the Chronik client once to be reused.
const chronik = new ChronikClient('https://chronik.be.cash/xec');

class WalletsWebviewProvider {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
        this.webviewView = null;
        console.log('WalletsWebviewProvider constructed');
    }

    /**
     * Called by VS Code when the sidebar view is resolved.
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        console.log('WalletsWebviewProvider.resolveWebviewView called');
        this.webviewView = webviewView;

        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async message => {
            console.log('WalletsWebviewProvider received message:', message);
            switch (message.command) {
                case 'createWallet':
                    {
                        const seed = bip39.generateMnemonic();
                        const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
                        const name = `Wallet ${wallets.length + 1}`;
                        const address = this.getAddressFromMnemonic(seed);

                        wallets.push({ name, address, seed });
                        await this.context.globalState.update('gitmark-ecash.wallets', wallets);
                        if (wallets.length === 1) {
                           await this.context.globalState.update('gitmark-ecash.selectedWallet', name);
                        }
                        await this.sendWallets();
                        break;
                    }
                case 'importWallet':
                    {
                        const seed = message.seed;
                        if (!seed || !bip39.validateMnemonic(seed)) {
                            vscode.window.showErrorMessage("Invalid seed phrase provided.");
                            return;
                        };
                        const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
                        const name = `Wallet ${wallets.length + 1}`;
                        const address = this.getAddressFromMnemonic(seed);

                        wallets.push({ name, address, seed });
                        await this.context.globalState.update('gitmark-ecash.wallets', wallets);
                        await this.sendWallets();
                        break;
                    }
                case 'selectWallet':
                    {
                        await this.context.globalState.update('gitmark-ecash.selectedWallet', message.name);
                        await this.sendWallets();
                        break;
                    }
                case 'removeWallet':
                    {
                        let wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
                        wallets = wallets.filter(w => w.name !== message.name);
                        await this.context.globalState.update('gitmark-ecash.wallets', wallets);

                        let selected = this.context.globalState.get('gitmark-ecash.selectedWallet', null);
                        if (selected === message.name) {
                            await this.context.globalState.update('gitmark-ecash.selectedWallet', wallets[0]?.name || null);
                        }
                        await this.sendWallets();
                        break;
                    }
                case 'showSeed':
                    {
                        const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
                        const wallet = wallets.find(w => w.name === message.name);
                        if (wallet) {
                            webviewView.webview.postMessage({ command: 'showSeed', name: wallet.name, seed: wallet.seed });
                        }
                        break;
                    }
                case 'refreshRequest':
                    {
                        await this.sendWallets();
                        break;
                    }
            }
        });

        this.sendWallets();
    }

    getAddressFromMnemonic(mnemonic) {
        // Removed getAddressFromMnemonic, use Wallet.fromMnemonic(mnemonic, chronik).getDepositAddress() directly
    }

    async sendWallets() {
        if (!this.webviewView) {
            return;
        }

        let errorContent = null;
        try {
            const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
            const selected = this.context.globalState.get('gitmark-ecash.selectedWallet', null);

            const walletInfos = await Promise.all(wallets.map(async w => {
                let balance = 0;
                try {
                    if (w.address) {
                        const utxosResult = await chronik.address(w.address).utxos();
                        if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                           balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt(utxo.value), 0);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to fetch balance for ${w.name}:`, e);
                    balance = 'Error';
                }
                return { ...w, balance };
            }));

            this.webviewView.webview.postMessage({ command: 'refresh', wallets: walletInfos, selected });
        } catch (err) {
            errorContent = `<div style='color:red;'><b>WalletsWebviewProvider Error:</b><br>${err.message}<br><pre>${err.stack}</pre></div>`;
            this.webviewView.webview.html = this.getHtml(errorContent);
        }
    }

    getHtml(errorContent = null) {
        return `
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 1em; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
                    .wallet { border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 0.5em; margin-bottom: 0.5em; cursor: pointer; }
                    .wallet:hover { background-color: var(--vscode-list-hoverBackground); }
                    .selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
                    button { margin-top: 5px; margin-right: 0.5em; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
                    button:hover { background-color: var(--vscode-button-hoverBackground); }
                    input { background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px; border-radius: 4px; }
                    .actions { margin-bottom: 1em; display: flex; gap: 0.5em; align-items: center; }
                    .seed-modal { display: none; position: fixed; z-index: 99; left: 0; top: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); align-items: center; justify-content: center; }
                    .seed-content { background: var(--vscode-editor-background); padding: 2em; border-radius: 8px; max-width: 400px; text-align: center; border: 1px solid var(--vscode-editorWidget-border); }
                </style>
            </head>
            <body>
                <div class="actions">
                    <button onclick="createWallet()">Create Wallet</button>
                    <input id="importSeed" placeholder="12-word seed phrase" style="flex-grow: 1;" />
                    <button onclick="importWallet()">Import</button>
                </div>
                <div id="wallets"></div>
                <div id="seedModal" class="seed-modal">
                    <div class="seed-content">
                        <h3 id="seedWalletName"></h3>
                        <p id="seedPhrase" style="font-size:1.2em;word-break:break-word;"></p>
                        <button onclick="closeSeedModal()">Close</button>
                    </div>
                </div>
                ${errorContent ? errorContent : ''}
                <script>
                    const vscode = acquireVsCodeApi();
                    function createWallet() { vscode.postMessage({ command: 'createWallet' }); }
                    function importWallet() {
                        const seed = document.getElementById('importSeed').value;
                        vscode.postMessage({ command: 'importWallet', seed });
                        document.getElementById('importSeed').value = '';
                    }
                    function selectWallet(name) { vscode.postMessage({ command: 'selectWallet', name }); }
                    function removeWallet(name) { vscode.postMessage({ command: 'removeWallet', name }); }
                    function showSeed(name) { vscode.postMessage({ command: 'showSeed', name }); }
                    function closeSeedModal() { document.getElementById('seedModal').style.display = 'none'; }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'showSeed') {
                            document.getElementById('seedWalletName').innerText = message.name;
                            document.getElementById('seedPhrase').innerText = message.seed;
                            document.getElementById('seedModal').style.display = 'flex';
                            return;
                        }
                        if (message.command === 'refresh') {
                            const { wallets, selected } = message;
                            const container = document.getElementById('wallets');
                            if (!wallets || wallets.length === 0) {
                                container.innerHTML = '<i>No wallets found. Create or import one to get started.</i>';
                                return;
                            }
                            container.innerHTML = wallets.map(w => `
                                <div class="wallet ${w.name === selected ? ' selected' : ''}" onclick="selectWallet('${w.name}')">
                                    <b>${w.name}</b><br/>
                                    <small>${w.address}</small><br/>
                                    <span>Balance: <b>${w.balance}</b> sats</span><br/>
                                    <button onclick="event.stopPropagation(); showSeed('${w.name}')">Show Seed</button>
                                    <button onclick="event.stopPropagation(); removeWallet('${w.name}')">Remove</button>
                                </div>
                            `).join('');
                        }
                    });
                    vscode.postMessage({ command: 'refreshRequest' });
                </script>
            </body>
            </html>
        `;
    }
}

module.exports = { WalletsWebviewProvider };
</DOCUMENT>

<DOCUMENT filename="src/commands/markCommit.js">
const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');
const { TxBuilder, Script, P2PKHSignatory, Ecc, shaRmd160, mnemonicToSeed, HdNode, ALL_BIP143, fromHex, toHex } = require('ecash-lib');

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

        const seedBuffer = mnemonicToSeed(selectedWallet.seed);
        const hdNode = HdNode.fromSeed(seedBuffer);
        const childNode = hdNode.derivePath("m/44'/899'/0'/0/0");
        const walletSk = childNode.privateKey;
        const walletPk = Ecc.derivePubkey(walletSk);
        const walletPkh = shaRmd160(walletPk);

        const address = selectedWallet.address;

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
                const utxos = utxosResult.utxos;

                progress.report({ message: "Constructing transaction..." });
                const txBuild = new TxBuilder();

                for (const utxo of utxos) {
                    const txidBytes = fromHex(utxo.outpoint.txid).reverse();
                    const value = BigInt(utxo.value);
                    const outputScript = Script.fromHex(utxo.outputScript);
                    const signatory = P2PKHSignatory(walletSk, walletPk, ALL_BIP143);
                    txBuild.addInput(txidBytes, utxo.outpoint.outIdx, value, outputScript, signatory);
                }

                const opReturnScript = Script.opReturn([Uint8Array.from(Buffer.from('gitmark')), Uint8Array.from(Buffer.from(commitHash))]);
                txBuild.addOutput(opReturnScript, 0n);

                const changeScript = Script.p2pkh(walletPkh);
                txBuild.addOutput(changeScript, 0n);

                const tx = txBuild.sign({ feePerKb: 1000n, dustSats: 546n });

                const rawTx = tx.ser();
                const txHex = toHex(rawTx);

                progress.report({ message: "Broadcasting to eCash network..." });
                const broadcastResult = await chronik.broadcastTx(txHex);
                const txid = broadcastResult.txid;

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
