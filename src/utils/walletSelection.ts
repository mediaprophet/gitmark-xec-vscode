import * as vscode from 'vscode';

export async function getOrSelectWallet(context: vscode.ExtensionContext): Promise<{ name: string; address: string } | undefined> {
    const wallets = context.globalState.get<{ name: string; address: string }[]>('gitmark-ecash.wallets', []);
    let selectedWalletName = context.globalState.get<string>('gitmark-ecash.selectedWallet');
    let selectedWallet = wallets.find(w => w.name === selectedWalletName);

    if (!selectedWallet) {
        if (wallets.length === 0) {
            vscode.window.showErrorMessage('No wallets available. Please create or import a wallet first.');
            return undefined;
        }
        const walletPick = await vscode.window.showQuickPick(wallets.map(w => w.name), {
            placeHolder: 'Select a wallet to use'
        });
        if (!walletPick) {
            vscode.window.showWarningMessage('No wallet selected.');
            return undefined;
        }
        selectedWalletName = walletPick;
        selectedWallet = wallets.find(w => w.name === selectedWalletName);
        if (!selectedWallet) {
            vscode.window.showErrorMessage('Selected wallet not found.');
            return undefined;
        }
        await context.globalState.update('gitmark-ecash.selectedWallet', selectedWalletName);
    }
    return selectedWallet;
}
