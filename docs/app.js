// ======= SET THESE =======
const CONTRACT_ADDRESS = "0x9d4F7bEEDa7E9661263B570e6497d4F7BaB8d02Bab3AEb4848454EFEc7A20e86"; // <— paste your Sepolia address
const SEPOLIA = {
  chainId: "0xaa36a7", // 11155111 in hex
  chainName: "Sepolia",
  rpcUrls: ["https://rpc.sepolia.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io/"]
};
// =========================

let provider, signer, contract, userAddr, ownerAddr, chainIdHex;

// Load ABI from local file
async function loadAbi() {
  const res = await fetch("./abi.json");
  const abi = await res.json();
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error("abi.json is empty. Paste your contract ABI into /docs/abi.json");
  }
  return abi;
}

function short(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "—";
}

async function ensureSepolia() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  chainIdHex = current;
  if (current !== SEPOLIA.chainId) {
    document.getElementById("switchBtn").style.display = "inline-block";
    return false;
  } else {
    document.getElementById("switchBtn").style.display = "none";
    return true;
  }
}

async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.chainId }]
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SEPOLIA]
      });
    } else {
      throw err;
    }
  }
}

async function connect() {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install it.");
    return;
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddr = await signer.getAddress();

  const abi = await loadAbi();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  const networkOk = await ensureSepolia();
  const netTag = document.getElementById("networkTag");
  netTag.textContent = networkOk ? "Sepolia" : "Wrong network";
  document.getElementById("addrTag").textContent = short(userAddr);

  try {
    ownerAddr = await contract.owner();
  } catch {
    ownerAddr = null;
  }
  document.getElementById("createPollCard").style.display =
    ownerAddr && ownerAddr.toLowerCase() === userAddr.toLowerCase()
      ? "block"
      : "none";

  await renderPolls();

  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}

async function renderPolls() {
  const container = document.getElementById("polls");
  container.innerHTML = "Loading polls…";
  try {
    const count = Number(await contract.getPollCount());
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
    container.innerHTML = `<div class="muted">Error loading polls: ${e?.message || e}</div>`;
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
    s.innerHTML = `Tx sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    s.innerHTML += " ✓ confirmed";
    await renderPolls();
  } catch (e) {
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
    status.innerHTML = `Tx sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    status.innerHTML += " ✓ created";
    document.getElementById("question").value = "";
    inputs.forEach(i => (i.value = ""));
    await renderPolls();
  } catch (e) {
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

// ---------- Top bar buttons ----------
document.getElementById("connectBtn").addEventListener("click", connect);
document.getElementById("switchBtn").addEventListener("click", async () => {
  await switchToSepolia();
  await connect();
});

// On load: show contract addr
document.getElementById("addrTag").textContent = short(CONTRACT_ADDRESS);
