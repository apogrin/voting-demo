// ======= SET THESE =======
// MUST be a 42-character Ethereum address (0x + 40 hex), NOT a 66-char tx hash
const CONTRACT_ADDRESS = "0xb7f2754297f9da369029adb875510dba55dea0b4"; // <- your Sepolia contract
const SEPOLIA = {
  chainId: "0xaa36a7", // 11155111 in hex
  chainName: "Sepolia",
  rpcUrls: ["https://rpc.sepolia.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io/"]
};
// =========================

let provider, signer, contract, userAddr, ownerAddr, chainIdHex, abiCache;

function log(...a){ console.log("[Voting]", ...a); }
function err(...a){ console.error("[Voting]", ...a); }
function short(addr){ return addr ? addr.slice(0,6) + "…" + addr.slice(-4) : "—"; }
function isValidAddress(a){
  try { return (window.ethers && window.ethers.isAddress) ? window.ethers.isAddress(a) : /^0x[a-fA-F0-9]{40}$/.test(a); }
  catch { return false; }
}
function setStatusTag(t){ const e=document.getElementById("networkTag"); if(e) e.textContent=t; }
function setAddrTag(t){ const e=document.getElementById("addrTag"); if(e) e.textContent=t; }

// Load ABI (cached)
async function loadAbi(){
  if (abiCache) return abiCache;
  const res = await fetch("./abi.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch abi.json: ${res.status}`);
  const abi = await res.json();
  if (!Array.isArray(abi) || abi.length === 0) throw new Error("abi.json is empty.");
  abiCache = abi;
  return abi;
}

async function ensureSepolia(){
  const current = await window.ethereum.request({ method: "eth_chainId" });
  chainIdHex = current;
  const ok = current === SEPOLIA.chainId;
  document.getElementById("switchBtn").style.display = ok ? "none" : "inline-block";
  return ok;
}

async function switchToSepolia(){
  try{
    await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: SEPOLIA.chainId }] });
  }catch(e){
    if (e.code === 4902){
      await window.ethereum.request({ method:"wallet_addEthereumChain", params:[SEPOLIA] });
    } else { throw e; }
  }
}

async function connect(){
  log("connect() start");
  if (!window.ethereum){
    alert("No Ethereum wallet found.\nInstall MetaMask in Chrome/Brave/Edge/Firefox, or open in MetaMask mobile browser.");
    return;
  }
  if (!isValidAddress(CONTRACT_ADDRESS)){
    setAddrTag("invalid address"); setStatusTag("⚠️ bad CONTRACT_ADDRESS");
    err("Invalid CONTRACT_ADDRESS. Use a 42-char address, not a tx hash.");
    return;
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddr = await signer.getAddress();
  setAddrTag(short(userAddr));
  log("accounts granted:", userAddr);

  const networkOk = await ensureSepolia();
  setStatusTag(networkOk ? "Sepolia" : "Wrong network");

  const abi = await loadAbi();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  try {
    ownerAddr = await contract.owner();
    log("owner()", ownerAddr);
  } catch {
    ownerAddr = null;
    log("owner() not in ABI (Create Poll hidden)");
  }

  // Owner-only create card
  document.getElementById("createPollCard").style.display =
    ownerAddr && ownerAddr.toLowerCase() === userAddr.toLowerCase() ? "block" : "none";

  // Initialize create form defaults
  resetCreateForm();

  await renderPolls();

  // React to changes
  window.ethereum.removeAllListeners?.("accountsChanged");
  window.ethereum.removeAllListeners?.("chainChanged");
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}

async function renderPolls(){
  log("renderPolls() start");
  const container = document.getElementById("polls");
  container.innerHTML = "Loading polls…";
  try {
    const count = Number(await contract.getPollCount());
    log("poll count =", count);
    if (!count){
      container.innerHTML = "<div class='muted'>No polls yet.</div>";
      return;
    }
    const items = [];
    for (let i = 0; i < count; i++){
      const [question, options, votes, isOpen] = await contract.getPoll(i);
      if (!isOpen) continue; // hide closed polls as requested
      const hasVoted = userAddr ? await contract.hasVoted(i, userAddr) : false;
      items.push(renderPollCard(i, question, options, votes, isOpen, hasVoted));
    }
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = "<div class='muted'>No open polls.</div>";
    } else {
      items.forEach(el => container.appendChild(el));
    }
  } catch (e) {
    err("renderPolls error", e);
    container.innerHTML = `<div class="muted">Error loading polls: ${e?.shortMessage || e?.message || e}</div>`;
  }
}

function renderPollCard(pollId, question, options, votes, isOpen, hasVoted){
  const card = document.createElement("div");
  card.className = "card";
  const total = votes.reduce((a,b)=> a + Number(b), 0);

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

  const ownerTools = (ownerAddr && userAddr && ownerAddr.toLowerCase() === userAddr.toLowerCase())
    ? `<button class="iconbtn" data-close="${pollId}" title="Close poll">Close poll</button>`
    : "";

  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0; flex:1">${question}</h3>
      <div>
        <span class="tag">${status}</span>
        ${you}
        ${ownerTools}
      </div>
    </div>
    <div style="margin-top:10px">${list}</div>
    <div class="activity" id="act-${pollId}">
      <div class="muted">Activity: loading…</div>
    </div>
    <div class="muted" id="s-${pollId}" style="margin-top:8px"></div>
  `;

  // Vote handlers
  card.querySelectorAll("button[data-poll]").forEach(btn => {
    if (btn.dataset.close !== undefined) return; // skip close button
    btn.addEventListener("click", async () => {
      await castVote(Number(btn.dataset.poll), Number(btn.dataset.idx));
    });
  });

  // Close poll (owner only)
  const closeBtn = card.querySelector(`button[data-close="${pollId}"]`);
  if (closeBtn){
    closeBtn.addEventListener("click", async () => {
      try {
        const s = document.getElementById(`s-${pollId}`);
        s.textContent = "Closing poll…";
        const tx = await contract.closePoll(pollId);
        log("closePoll tx", tx.hash);
        s.innerHTML = `Poll closing… <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a>`;
        await tx.wait();
        await renderPolls(); // removes it from the list
      } catch (e) {
        err("closePoll error", e);
        alert(e?.shortMessage || e?.message || String(e));
      }
    });
  }

  // Load activity (event history)
  updateActivity(pollId, card.querySelector(`#act-${pollId}`)).catch(e=>{
    err("activity error", e);
  });

  return card;
}

async function castVote(pollId, optionIdx){
  const s = document.getElementById(`s-${pollId}`);
  try {
    s.textContent = "Sending transaction…";
    const tx = await contract.vote(pollId, optionIdx);
    log("vote tx", tx.hash);
    s.innerHTML = `Vote sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    s.innerHTML += " ✓ confirmed";
    await renderPolls();
  } catch (e) {
    err("castVote error", e);
    s.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
}

/* ---------- Activity / Event history ---------- */
async function updateActivity(pollId, mountEl){
  // Show PollCreated + VoteCast tx links so everyone can click through to Etherscan
  const iface = contract.interface;
  const fromBlockWindow = 200000; // ~safe window on Sepolia
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - fromBlockWindow);

  // topics
  const tCreated = ethers.id("PollCreated(uint256,string,string[])");
  const tVoted   = ethers.id("VoteCast(uint256,address,uint256)");
  const topicPollId = ethers.zeroPadValue(ethers.toBeHex(pollId), 32);

  const logsCreated = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock,
    toBlock: "latest",
    topics: [tCreated, topicPollId]
  });

  const logsVoted = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock,
    toBlock: "latest",
    topics: [tVoted, topicPollId]
  });

  const createdRow = logsCreated.length
    ? `<li>Poll created — <a target="_blank" href="https://sepolia.etherscan.io/tx/${logsCreated[0].transactionHash}">${short(logsCreated[0].transactionHash)}</a></li>`
    : `<li class="muted">Poll created — not in recent window</li>`;

  const voteRows = logsVoted
    .map(l => {
      const parsed = iface.parseLog(l);
      const voter = parsed.args[1];        // address
      const txh = l.transactionHash;
      return `<li>Vote by ${short(voter)} — <a target="_blank" href="https://sepolia.etherscan.io/tx/${txh}">${short(txh)}</a></li>`;
    })
    .join("");

  mountEl.innerHTML = `
    <div><strong>Activity</strong></div>
    <ul style="margin:6px 0 0 18px; padding:0">
      ${createdRow}
      ${voteRows || `<li class="muted">No votes yet</li>`}
    </ul>
  `;
}

/* ---------- Create Poll UI (owner) ---------- */
function makeOptionRow(value=""){
  const div = document.createElement("div");
  div.className = "option";
  div.innerHTML = `
    <input placeholder="Option" value="${value.replace(/"/g,'&quot;')}" />
    <button class="iconbtn btn-remove" title="Remove option">−</button>
  `;
  const wrap = document.getElementById("optionsWrap");
  wrap.appendChild(div);
  syncRemoveButtons();
  div.querySelector(".btn-remove").addEventListener("click", () => {
    const count = wrap.querySelectorAll("input").length;
    if (count <= 2) return; // keep at least 2
    div.remove();
    syncRemoveButtons();
  });
}

function syncRemoveButtons(){
  const wrap = document.getElementById("optionsWrap");
  const inputs = wrap.querySelectorAll("input");
  const buttons = wrap.querySelectorAll(".btn-remove");
  const disable = inputs.length <= 2;
  buttons.forEach(b => b.disabled = disable);
}

function resetCreateForm(){
  document.getElementById("question").value = "What’s your favourite cryptocurrency?";
  const wrap = document.getElementById("optionsWrap");
  wrap.innerHTML = "";
  makeOptionRow("BTC");
  makeOptionRow("ETH");
  // a third optional row is easy to add manually via + Add option
  document.getElementById("createStatus").textContent = "";
}

document.getElementById("addOptBtn").addEventListener("click", () => {
  const wrap = document.getElementById("optionsWrap");
  const count = wrap.querySelectorAll("input").length;
  if (count >= 10) { alert("Max 10 options."); return; }
  makeOptionRow("");
});

document.getElementById("resetBtn").addEventListener("click", resetCreateForm);

document.getElementById("createBtn").addEventListener("click", async () => {
  const q = document.getElementById("question").value.trim();
  const inputs = [...document.querySelectorAll("#optionsWrap input")];
  const opts = inputs.map(i => i.value.trim()).filter(Boolean);
  const status = document.getElementById("createStatus");

  if (!q || opts.length < 2) {
    status.textContent = "Enter a question and at least two non-empty options.";
    return;
  }
  try {
    status.textContent = "Creating poll…";
    const tx = await contract.createPoll(q, opts);
    log("createPoll tx", tx.hash);
    status.innerHTML = `Poll creation sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    status.innerHTML += " ✓ created";
    resetCreateForm();
    await renderPolls();
  } catch (e) {
    err("createPoll error", e);
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

/* ---------- Top bar buttons ---------- */
document.getElementById("connectBtn").addEventListener("click", () => { log("connect button clicked"); connect(); });
document.getElementById("switchBtn").addEventListener("click", async () => { await switchToSepolia(); await connect(); });

// On load: show something so you know JS is running; auto-connect if already authorized
setAddrTag("script-ok");
log("app.js loaded");

if (window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" })
    .then(accts => {
      if (accts && accts.length) { log("already authorized:", accts[0]); connect(); }
      else { log("not yet authorized"); }
    })
    .catch(e => err("eth_accounts error", e));
} else {
  log("window.ethereum missing (install MetaMask)");
}
