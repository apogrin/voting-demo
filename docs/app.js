// ======= SET THESE =======
// NOTE: This MUST be a 42-character Ethereum address: 0x + 40 hex chars.
// If you paste a 66-char tx hash (0x + 64 hex), the app will not work.
const CONTRACT_ADDRESS = "0xdec49157520833c912f4e5a05a1c424a03223f13a4f950229a1b091a3a202641"; // e.g., 0xAbC...123
const SEPOLIA = {
  chainId: "0xaa36a7", // 11155111 in hex
  chainName: "Sepolia",
  rpcUrls: ["https://rpc.sepolia.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io/"]
};
// =========================

let provider, signer, contract, userAddr, ownerAddr, chainIdHex;

function log(...args) { console.log("[Voting]", ...args); }
function err(...args) { console.error("[Voting]", ...args); }

function short(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "—";
}

// Basic address sanity check (ethers v6 has ethers.isAddress)
function isValidAddress(a) {
  try { return (window.ethers && window.ethers.isAddress) ? window.ethers.isAddress(a) : /^0x[a-fA-F0-9]{40}$/.test(a); }
  catch { return false; }
}

// UI helpers
function setStatusTag(text) {
  const tag = document.getElementById("networkTag");
  if (tag) tag.textContent = text;
}
function setAddrTag(text) {
  const tag = document.getElementById("addrTag");
  if (tag) tag.textContent = text;
}

// Load ABI from local file
async function loadAbi() {
  const res = await fetch("./abi.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch abi.json: ${res.status}`);
  const abi = await res.json();
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error("abi.json is empty. Paste your contract ABI into /docs/abi.json");
  }
  return abi;
}

async function ensureSepolia() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  chainIdHex = current;
  const ok = current === SEPOLIA.chainId;
  document.getElementById("switchBtn").style.display = ok ? "none" : "inline-block";
  return ok;
}

async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.chainId }]
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [SEPOLIA] });
    } else {
      throw e;
    }
  }
}

async function connect() {
  log("connect() start");

  // MetaMask presence
  if (!window.ethereum) {
    alert("No Ethereum wallet found.\nInstall MetaMask in Chrome/Brave/Edge/Firefox, or open in MetaMask mobile browser.");
    return;
  }

  // Validate contract address early to avoid confusing errors later
  if (!isValidAddress(CONTRACT_ADDRESS)) {
    setAddrTag("invalid address");
    setStatusTag("⚠️ bad CONTRACT_ADDRESS");
    err("Invalid CONTRACT_ADDRESS. Make sure it is a 42-char address, not a tx hash.");
    return;
  }

  // Request accounts
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddr = await signer.getAddress();
  setAddrTag(short(userAddr));
  log("accounts granted:", userAddr);

  // Ensure network
  const networkOk = await ensureSepolia();
  setStatusTag(networkOk ? "Sepolia" : "Wrong network");

  // Init contract
  const abi = await loadAbi();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  try {
    ownerAddr = await contract.owner();
    log("owner()", ownerAddr);
  } catch (e) {
    // If your contract doesn't have owner(), this will fail—hide the create form in that case
    ownerAddr = null;
    log("owner() not available on this ABI (Create Poll will be hidden)");
  }

  document.getElementById("createPollCard").style.display =
    ownerAddr && ownerAddr.toLowerCase() === userAddr.toLowerCase() ? "block" : "none";

  await renderPolls();

  // React to changes
  window.ethereum.removeAllListeners?.("accountsChanged");
  window.ethereum.removeAllListeners?.("chainChanged");
  window.ethereum.on("accountsChanged", () => { location.reload(); });
  window.ethereum.on("chainChanged", () => { location.reload(); });
}

async function renderPolls() {
  log("renderPolls() start");
  const container = document.getElementById("polls");
  container.innerHTML = "Loading polls…";
  try {
    const count = Number(await contract.getPollCount());
    log("poll count =", count);
    if (count === 0) {
      container.innerHTML = "<div class='muted'>No polls yet.</div>";
      return;
    }
    const items = [];
    for (let i = 0; i < count; i++) {
      const [question, options, votes, isOpen] = await contract.getPoll(i);
      const hasVoted = userAddr ? await contract.hasVoted(i, userAddr) : false;
      items.push(renderPollCard(i, question, options, votes, isOpen, hasVoted));
    }
    container.innerHTML = "";
    items.forEach(el => container.appendChild(el));
  } catch (e) {
    err("renderPolls error", e);
    container.innerHTML = `<div class="muted">Error loading polls: ${e?.shortMessage || e?.message || e}</div>`;
  }
}

function renderPollCard(pollId, question, options, votes, isOpen, hasVoted) {
  const card = document.createElement("div");
  card.className = "card";
  const total = votes.reduce((a, b) => a + Number(b), 0);

  const list = options.map((opt, idx) => {
    const v = Number(votes[idx]);
    const pct = total ? Math.round((v / total) * 100) : 0;
    const disabled = !isOpen || hasVoted;
    return `
      <div class="row" style="align-items:center; justify-content:space-between; gap:10px">
        <div style="flex:1">${opt}</div>
        <div class="pill">${v} ${total ? `(${pct}%)` : ""}</div>
        <button ${disabled ? "disabled" : ""} data-poll="${pollId}" data-idx="${idx}">Vote</button>
      </div>
    `;
  }).join("");

  const status = isOpen ? "Open" : "Closed";
  const you = hasVoted ? `<span class="tag">You already voted</span>` : "";

  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0; flex:1">${question}</h3>
      <div>
        <span class="tag">${status}</span>
        ${you}
      </div>
    </div>
    <div style="margin-top:10px">${list}</div>
    <div class="muted" id="s-${pollId}" style="margin-top:8px"></div>
  `;

  card.querySelectorAll("button[data-poll]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await castVote(Number(btn.dataset.poll), Number(btn.dataset.idx));
    });
  });

  return card;
}

async function castVote(pollId, optionIdx) {
  const s = document.getElementById(`s-${pollId}`);
  try {
    s.textContent = "Sending transaction…";
    const tx = await contract.vote(pollId, optionIdx);
    log("vote tx", tx.hash);
    s.innerHTML = `Tx sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    s.innerHTML += " ✓ confirmed";
    await renderPolls();
  } catch (e) {
    err("castVote error", e);
    s.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
}

// ---------- Create poll (owner only) ----------
document.getElementById("addOptBtn").addEventListener("click", () => {
  const div = document.createElement("div");
  div.className = "option";
  div.innerHTML = `<input placeholder="Another option" />`;
  document.getElementById("optionsWrap").appendChild(div);
});

document.getElementById("createBtn").addEventListener("click", async () => {
  const q = document.getElementById("question").value.trim();
  const inputs = [...document.querySelectorAll("#optionsWrap input")];
  const opts = inputs.map(i => i.value.trim()).filter(Boolean);
  const status = document.getElementById("createStatus");

  if (!q || opts.length < 2) {
    status.textContent = "Enter a question and at least two options.";
    return;
  }
  try {
    status.textContent = "Creating poll…";
    const tx = await contract.createPoll(q, opts);
    log("createPoll tx", tx.hash);
    status.innerHTML = `Tx sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    status.innerHTML += " ✓ created";
    document.getElementById("question").value = "";
    inputs.forEach(i => (i.value = ""));
    await renderPolls();
  } catch (e) {
    err("createPoll error", e);
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

// ---------- Top bar buttons ----------
document.getElementById("connectBtn").addEventListener("click", () => {
  log("connect button clicked");
  connect();
});
document.getElementById("switchBtn").addEventListener("click", async () => {
  await switchToSepolia();
  await connect();
});

// On load: show something so you know JS is running; auto-connect if already authorized
setAddrTag("script-ok");
log("app.js loaded");

if (window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" })
    .then(accts => {
      if (accts && accts.length) {
        log("already authorized:", accts[0]);
        connect(); // silent connect
      } else {
        log("not yet authorized");
      }
    })
    .catch(e => err("eth_accounts error", e));
} else {
  log("window.ethereum missing (install MetaMask)");
}
