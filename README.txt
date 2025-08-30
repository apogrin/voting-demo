🗳️ Voting DApp (Classroom Demo)
A simple decentralized application (DApp) that demonstrates how blockchain voting works.
Students can connect with MetaMask, view polls, and cast votes. Instructors can create and close polls.

This project is built with:
- Solidity smart contract (deployed on Sepolia testnet)
- ethers.js v6 frontend integration
- GitHub Pages hosting for demo access

✨ Features
- Connect MetaMask wallet (Sepolia testnet)
- Students can view polls and vote (one vote per account)
- Instructors can create polls with 2–10 options
- Instructors can close polls to freeze results
- Links to Etherscan for every transaction (poll creation, voting, closing)
- Simple, minimal UI for classroom teaching

🚀 Getting Started

1. Install MetaMask
Add the MetaMask extension to Chrome/Brave/Edge or use the MetaMask mobile app.
Switch to the Sepolia test network.

2. Import Your Demo Wallet
Use the seed phrase / private key provided by the instructor.
Each wallet is pre-funded with test ETH from the Sepolia faucet.

3. Open the DApp
Visit the GitHub Pages deployment:

👉 Voting Demo Site
4. Connect & Participate
Click Connect Wallet and approve in MetaMask.
Your address will appear in the header.

Students: select a poll → choose an option → confirm the MetaMask transaction.
Instructors: create new polls or close polls.

🛠️ Development Requirements:
- Node.js 18+ (if running locally)
- MetaMask (browser wallet)
- Sepolia ETH (testnet faucet: https://sepoliafaucet.com)

Running Locally
git clone https://github.com/your-username/voting-demo.git
cd voting-demo/docs
# Open index.html in your browser
You can also use a lightweight server like:
npx serve.

📜 Smart Contract

Contract: Voting.sol
Network: Sepolia Testnet
Address: 0x.... (update this with your deployed contract)
Key functions:
createPoll(string question, string[] options) → create a new poll (instructors only)
closePoll(uint256 pollId) → close a poll
vote(uint256 pollId, uint256 optionIndex) → cast a vote
getPoll(uint256 pollId) → read poll details & tallies
hasVoted(uint256 pollId, address voter) → check if an address has voted

🎓 Classroom Demo Workflow

- Instructor shares wallets (pre-funded with Sepolia ETH).
- Students import wallets into MetaMask.
- Students connect to the Voting DApp site.
- Instructor creates a poll (e.g., “What’s your favorite cryptocurrency?”).
- Students cast their votes → see confirmations on Etherscan.
- Instructor closes the poll → results are frozen.

📄 License
MIT License – free to use for teaching and demos.
