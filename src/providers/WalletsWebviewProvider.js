const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');
const bip39 = require('bip39');
const { Wallet } = require('ecash-wallet');

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
                            const wallet = Wallet.fromMnemonic(seed, chronik);
                            const address = wallet.getDepositAddress();

                            // Store seed securely
                            await this.context.secrets.store(`wallet.${name}.seed`, seed);
                            wallets.push({ name, address }); // Only store non-sensitive info
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
                            }
                            const wallets = this.context.globalState.get('gitmark-ecash.wallets', []);
                            const name = `Wallet ${wallets.length + 1}`;
                            const wallet = Wallet.fromMnemonic(seed, chronik);
                            const address = wallet.getDepositAddress();

                            // Store seed securely
                            await this.context.secrets.store(`wallet.${name}.seed`, seed);
                            wallets.push({ name, address }); // Only store non-sensitive info
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
                let changeAddress = '';
                let tokenAddress = '';
                let utxos = [];
                let txHistory = [];
                try {
                    const walletObj = Wallet.fromMnemonic(w.seed, chronik);
                    changeAddress = walletObj.getChangeAddress ? walletObj.getChangeAddress() : '';
                    tokenAddress = walletObj.getTokenAddress ? walletObj.getTokenAddress() : '';
                    if (w.address) {
                        const utxosResult = await chronik.address(w.address).utxos();
                        if (utxosResult.utxos && utxosResult.utxos.length > 0) {
                            balance = utxosResult.utxos.reduce((acc, utxo) => acc + parseInt(utxo.value), 0);
                            utxos = utxosResult.utxos;
                        }
                        // Transaction history
                        const txsResult = await chronik.address(w.address).txs();
                        if (txsResult.txs && txsResult.txs.length > 0) {
                            txHistory = txsResult.txs.map(tx => ({
                                txid: tx.txid,
                                block: tx.block,
                                time: tx.time,
                                inputs: tx.inputs,
                                outputs: tx.outputs
                            }));
                        }
                    }
                } catch (e) {
                    console.error(`Failed to fetch wallet details for ${w.name}:`, e);
                    balance = 'Error';
                }
                return { ...w, balance, changeAddress, tokenAddress, utxos, txHistory };
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
                <script src="https://unpkg.com/localforage/dist/localforage.js"></script>
            </head>
            <body>
                <div class="actions">
                    <button onclick="createWallet()" title="Create Wallet">
                        <svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;"><path fill="currentColor" d="M12 5v14m-7-7h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button onclick="importWallet()" title="Import Wallet from Seed">
                        <img src="vscode-resource:/images/import-wallet.svg" alt="Import" style="width:20px;height:20px;vertical-align:middle;" />
                    </button>
                    <input id="importSeed" placeholder="12-word seed phrase" style="flex-grow: 1; margin-left:0.5em;" />
                    <button onclick="refreshWallets()" title="Refresh Wallets">
                        <svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;"><path fill="none" stroke="currentColor" stroke-width="2" d="M4.93 4.93a10 10 0 1 1-1.41 1.41"/><path fill="none" stroke="currentColor" stroke-width="2" d="M1 1v6h6"/></svg>
                    </button>
                </div>
                <script>
                    function refreshWallets() {
                        vscode.postMessage({ command: 'refreshRequest' });
                    }
                </script>
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
                    // Store private keys in localforage only
                    async function storePrivateKey(name, seed) {
                        await localforage.setItem('wallet-' + name + '-seed', seed);
                    }
                    async function getPrivateKey(name) {
                        return await localforage.getItem('wallet-' + name + '-seed');
                    }
                    function createWallet() {
                        vscode.postMessage({ command: 'createWallet' });
                    }
                    function importWallet() {
                        const seed = document.getElementById('importSeed').value;
                        vscode.postMessage({ command: 'importWallet', seed });
                        document.getElementById('importSeed').value = '';
                    }
                    function selectWallet(name) { vscode.postMessage({ command: 'selectWallet', name }); }
                    function removeWallet(name) {
                        vscode.postMessage({ command: 'removeWallet', name });
                        localforage.removeItem('wallet-' + name + '-seed');
                    }
                    function showSeed(name) {
                        getPrivateKey(name).then(seed => {
                            document.getElementById('seedWalletName').innerText = name;
                            document.getElementById('seedPhrase').innerText = seed || '(not stored)';
                            document.getElementById('seedModal').style.display = 'flex';
                        });
                    }
                    function closeSeedModal() { document.getElementById('seedModal').style.display = 'none'; }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'showSeed') {
                        // ...existing code...
                    });
                    vscode.postMessage({ command: 'refreshRequest' });
                </script>
            </body>
            </html>
        `;
    }
}

module.exports = { WalletsWebviewProvider };