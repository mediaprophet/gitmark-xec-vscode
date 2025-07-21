# Gitmark for eCash (XEC)

VS Code extension to mark git commits on the eCash blockchain and manage eCash wallets.

## Features
- Create, import, and remove eCash wallets
- View wallet addresses, balances, UTXOs, and transaction history
- Mark git commits on the eCash blockchain
- Copy wallet addresses
- Show deposit, change, and token addresses
- Show seed phrase
- List UTXOs
- Show wallet balance

## Installation
1. Clone this repository:
   ```sh
   git clone https://github.com/mediaprophet/gitmark-ecash.git
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Open the folder in VS Code and press `F5` to launch the extension in a new Extension Development Host window.

## Usage
- Use the sidebar to manage wallets and view details.
- Use the command palette (`Ctrl+Shift+P`) to access wallet commands:
  - Create New Wallet
  - Import Wallet from Seed
  - Remove Wallet
  - Copy Address
  - Show Deposit Address
  - Show Change Address
  - Show Token Address
  - Show Seed Phrase
  - Show Balance
  - List UTXOs
  - Mark latest commit

## Testing
- Run extension tests using VS Code's test runner or with:
  ```sh
  npm run test
  ```

## Requirements
- Node.js >= 16
- VS Code >= 1.85.0

## Contributing
Pull requests and issues are welcome!

## License
MIT
