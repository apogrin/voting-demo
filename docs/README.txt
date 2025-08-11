# Voting DApp /docs bundle

This folder is ready to be committed to your repo as `/docs` so GitHub Pages can host it.

## What you MUST change
1) **Paste your deployed contract address** into `app.js` at `CONTRACT_ADDRESS`.
2) **Replace `abi.json`** with the ABI copied from Remix after compiling your `Voting.sol`:
   - In Remix, compile the contract → click **ABI** → **Copy**.
   - Paste the JSON array into `/docs/abi.json` (replace the current `[]`).

## Publish on GitHub Pages
- Repo → **Settings → Pages → Build and deployment**.
- Source: **Deploy from a branch**.
- Branch: **main** (or default) and **/docs** folder.
- Save; Pages will give you a URL like `https://<user>.github.io/<repo>/`.

## Notes
- The Create Poll section appears only when the connected wallet is the contract `owner()`.
- Students should switch MetaMask to **Sepolia** testnet.
- Do **NOT** commit private keys. Testnet wallets can be distributed separately.
