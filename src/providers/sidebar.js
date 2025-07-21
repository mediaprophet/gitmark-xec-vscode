const vscode = require('vscode');
const { ChronikClient } = require('chronik-client');
const { WalletManager } = require('./wallets');

const chronik = new ChronikClient('https://chronik.be.cash/xec');

class SidebarProvider {
    constructor(context) {
        this.context = context;
        this.walletManager = new WalletManager(context);
        this.webviewView = null;
        console.log('SidebarProvider constructed');
    }

    resolveWebviewView(webviewView) {
        console.log('SidebarProvider.resolveWebviewView called');
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('SidebarProvider received message:', message);
            switch (message.command) {
                case 'createWallet':
                    await this.walletManager.createWallet();
                    await this.sendWallets();
                    break;
                case 'importWallet':
                    try {
                        await this.walletManager.importWallet(message.seed);
                        await this.sendWallets();
                    } catch (e) {
                        vscode.window.showErrorMessage('Invalid seed phrase provided.');
                    }
                    break;
                case 'selectWallet':
                    await this.walletManager.selectWallet(message.name);
                    await this.sendWallets();
                    break;
                case 'removeWallet':
                    await this.walletManager.removeWallet(message.name);
                    await this.sendWallets();
                    break;
                case 'showSeed':
                    const seed = await this.walletManager.getPrivateKey(message.name);
                    webviewView.webview.postMessage({ command: 'showSeed', name: message.name, seed });
                    break;
                case 'refreshRequest':
                    await this.sendWallets();
                    break;
            }
        });
        this.sendWallets();
    }

    async sendWallets() {
        if (!this.webviewView) return;
        let errorContent = null;
        try {
            const wallets = this.walletManager.getWallets();
            const selected = this.walletManager.getSelectedWallet();
            const walletInfos = await Promise.all(wallets.map(async (w) => {
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
            errorContent = `<div style='color:red;'><b>SidebarProvider Error:</b><br>${err.message}<br><pre>${err.stack}</pre></div>`;
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
                            storePrivateKey(message.name, message.seed);
                            showSeed(message.name);
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

module.exports = { SidebarProvider };
