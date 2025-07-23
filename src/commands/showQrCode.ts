import * as vscode from 'vscode';
import * as QRCode from 'qrcode';

export async function showWalletQrCode(walletItem: { address: string; label: string }) {
    if (!walletItem || !walletItem.address) {
        vscode.window.showErrorMessage('No wallet selected.');
        return;
    }
    const address = walletItem.address;
    const panel = vscode.window.createWebviewPanel(
        'walletQrCode',
        `QR Code for ${walletItem.label}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    const qrDataUrl = await QRCode.toDataURL(address);
    panel.webview.html = `
        <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
            <h2>Wallet: ${walletItem.label}</h2>
            <img src="${qrDataUrl}" alt="QR Code" style="width:256px;height:256px;" />
            <p style="word-break:break-all;">${address}</p>
        </body>
        </html>
    `;
}
