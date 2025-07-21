# Functional Specification: Gitmark for eCash VS Code Extension

## Overview
Gitmark for eCash is a Visual Studio Code extension that enables users to manage eCash (XEC) wallets and mark git commits on the eCash blockchain. The extension provides a native sidebar experience using a tree view, following VS Code UX guidelines, and supports secure wallet management, commit marking, and blockchain integration.

## Features

### 1. Wallet Management
- **Create Wallet**: Generate a new eCash wallet using a BIP39 mnemonic and display it in the sidebar tree view.
- **Import Wallet**: Import an existing wallet using a 12-word seed phrase.
- **Select Wallet**: Choose an active wallet for operations; selection is reflected in the UI.
- **Remove Wallet**: Delete a wallet from the extension and securely remove its private key.
- **Show Seed**: Display the seed phrase for a selected wallet in a secure modal.
- **Balance Display**: Show the current balance for each wallet, fetched from the Chronik blockchain API.

### 2. Commit Marking
- **Mark Commit**: Register the latest git commit on the eCash blockchain using the selected wallet.
- **Commit History**: (Planned) Display a history of marked commits and their blockchain status.

### 3. Secure Storage
- **Private Key Storage**: Store wallet seed phrases securely using localforage in the user's browser environment.
- **Global State**: Use VS Code's globalState for wallet metadata and selection tracking.

### 4. User Interface
- **Sidebar Tree View**: Native VS Code tree view for wallet management, replacing any previous webview implementation.
- **Activity Bar Icon**: Custom icon for the extension in the VS Code activity bar.
- **Context Menu Actions**: Right-click actions for wallet management (create, import, remove, show seed).
- **Welcome Content**: Display onboarding instructions when no wallets are present.

## Technical Architecture
- **Extension Entry**: `extension.js` registers the tree view, wallet commands, and integrates with VS Code APIs.
- **WalletsTreeProvider**: Implements the tree view logic for displaying and managing wallets.
- **WalletManager**: Handles wallet creation, import, selection, removal, and secure storage.
- **Blockchain Integration**: Uses `chronik-client` to fetch wallet balances and mark commits.
- **Dependencies**: `bip39`, `ecash-lib`, `chronik-client`, `localforage`, and VS Code extension API.

## UX Guidelines
- All wallet management is performed via the native sidebar tree view.
- No webview is used; all UI elements are VS Code-compliant.
- Activity bar icon and sidebar integration follow VS Code manifest requirements.

## Security Considerations
- Seed phrases are never transmitted externally; stored securely in localforage.
- Wallet operations are performed locally; blockchain interactions use public APIs.

## Future Enhancements
- Commit history view and blockchain status tracking.
- Multi-wallet support for marking commits from different addresses.
- Advanced wallet settings and export options.

---

This specification describes the current and planned functionality for the Gitmark for eCash VS Code extension, ensuring a secure, native, and user-friendly wallet and commit marking experience.
