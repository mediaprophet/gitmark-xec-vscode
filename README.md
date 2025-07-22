# **Gitmark for eCash (XEC)**

A native VS Code extension to manage eCash (XEC) wallets and permanently anchor your git commits on the eCash blockchain.

## **Overview**

Gitmark brings the power of blockchain immutability to your source code. This extension provides a seamless experience for developers to:

* Securely Manage Wallets: Create, import, and manage eCash wallets directly within the VS Code sidebar.  
* Timestamp Commits: Create a permanent, auditable, and decentralized timestamp for any git commit by anchoring it to the eCash blockchain.  
* Enhance Project Integrity: Provide cryptographic proof of your project's history, protecting it against unauthorized changes and disputes.

## **Features**

### **Wallet Management (Sidebar)**

* ✅ Create & Import Wallets: Easily generate new wallets or import existing ones using a 12-word seed phrase.  
* ✅ Secure Storage: Seed phrases are stored securely using VS Code's native SecretStorage API.  
* ✅ View Balances: See the live balance of each wallet.  
* ✅ Rename & Remove: Manage your list of wallets with simple right-click context menu actions.  
* ✅ Copy Address: Quickly copy a wallet's address to the clipboard.  
* ✅ Backup Seed Phrase: Securely view your seed phrase for backup.

### **Commit Marking**

* ✅ One-Click Marking: Mark your latest commit directly from the Source Control panel with a single click.  
* ✅ Commit History: View a list of all marked commits and their corresponding transaction IDs in the sidebar.  
* ✅ Block Explorer Integration: Instantly view any marking transaction on a public eCash block explorer.

## **Installation**

1. Open Visual Studio Code.  
2. Go to the Extensions view (Ctrl+Shift+X).  
3. Search for Gitmark for eCash.  
4. Click Install.

## **Usage**

1. Open the Gitmark Sidebar: Click on the Gitmark icon in the VS Code Activity Bar.  
2. Create or Import a Wallet:  
   * Use the \+ button in the "Wallets" view to create a new wallet. Give it a name when prompted.  
   * Use the import button to add an existing wallet from its 12-word seed phrase.  
3. Select a Wallet: Click on a wallet in the list to select it for use.  
4. Mark a Commit:  
   * Go to the Source Control view (Ctrl+Shift+G).  
   * After making a commit, click the "Mark Commit on eCash" button ($(cloud-upload)) at the top of the panel.  
   * The transaction will be broadcast, and a new entry will appear in your "Commit History" view.

## **For Developers (Local Setup)**

1. Clone the repository:  
   git clone https://github.com/mediaprophet/gitmark-xec-vscode.git

2. Install dependencies:  
   npm install

3. Compile the TypeScript:  
   npm run compile

4. Open the folder in VS Code and press F5 to launch the extension in a new debug window.

## **Contributing**

Contributions, issues, and feature requests are welcome\! Feel free to check the [issues page](https://www.google.com/search?q=https://github.com/mediaprophet/gitmark-xec-vscode/issues).

## **License**

This project is licensed under the MIT License.