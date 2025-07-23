## Marking a Commit Workflow

Yes, that is the correct process.

You must commit your code changes to your local Git repository before running the "Mark Commit" command.

Here’s the correct workflow:

1. Make your code changes.
2. Stage the changes (e.g., `git add .`).
3. Commit the changes (e.g., `git commit -m "Your message"`). This creates a new commit with a unique hash.
4. Run the **Gitmark: Mark Commit** command.
# **Gitmark for eCash (XEC)**

A powerful VS Code extension to manage eCash (XEC) wallets and anchor your git commits on the eCash blockchain.

---

## 🚀 Features

- **Wallet Management**
  - Create, import, rename, and remove eCash wallets
  - Secure seed phrase storage using VS Code SecretStorage
  - View live wallet balances
  - Copy wallet address
  - View and backup seed phrase
- **Transaction History**
  - View recent transactions for each wallet
  - See direction, amount, and counterparty for each transaction
  - Right-click to copy sender/receiver address
  - Open transactions in the block explorer
- **Commit Marking**
  - Mark git commits on the eCash blockchain with one click
  - View commit history and associated transaction IDs
  - Instantly open marking transactions in the block explorer

---

## 🛠️ Installation

1. Open Visual Studio Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for **Gitmark for eCash**
4. Click **Install**

---

## 📖 Usage Instructions

### Wallets
- Open the Gitmark sidebar (activity bar icon)
- Use the (+) button to create a new wallet or import an existing one
- Right-click a wallet for options: rename, remove, copy address, show seed phrase
- Select a wallet to view its balance and transaction history

### Transactions
- Click a wallet to view its recent transactions
- Each transaction shows direction (received/sent), amount, and counterparty
- Right-click a transaction to copy the sender or receiver address
- Click the link icon to view the transaction in the block explorer

### Marking Commits
- Go to the Source Control view (Ctrl+Shift+G)
- After committing, click **Mark Commit on eCash** ($(cloud-upload))
- The commit is anchored to the blockchain; view details in the Commit History sidebar

---

## 👩‍💻 For Developers

1. Clone the repo:
   ```sh
   git clone https://github.com/mediaprophet/gitmark-xec-vscode.git
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Compile TypeScript:
   ```sh
   npm run compile
   ```
4. Open the folder in VS Code and press F5 to launch/debug the extension

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
- Check the [issues page](https://github.com/mediaprophet/gitmark-xec-vscode/issues)
- Submit pull requests for improvements

---

## 📄 License

MIT License

---

## 💡 Tips & Notes
- All wallet operations are local and private; seed phrases are never sent to any server
- Only the selected wallet is used for marking commits
- Transaction history is fetched live from Chronik servers
- For troubleshooting, see the `xec-errors.md` file for debug logs

---

**Enjoy secure, auditable, and decentralized commit marking for your projects!**