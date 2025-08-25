// ======= SET THESE =======
const CONTRACT_ADDRESS = "0x3FddF28630002B1E1f9FcF9BD9b94c839EB73A53"; // <— replace after redeploy
const SEPOLIA = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  rpcUrls: ["https://rpc.sepolia.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io/"]
};
// =========================

let provider, signer, contract, userAddr, ownerAddr, abiCache;
let isInstructorMe = false;

function log(...a){ console.log("[Voting]", ...a); }
function err(...a){ console.error("[Voting]", ...a); }
function short(a){ return a ? a.slice(0,6) + "…" + a.slice(-4) : "—"; }
function isValidAddress(a){ try { return (window.ethers && window.ethers.isAddress) ? window.ethers.isAddress(a) : /^0x[a-fA-F0-9]{40}$/.test(a);} catch { return false; } }
function setStatusTag(t){ const e=document.getElementById("networkTag"); if(e) e.textContent=t; }
function setAddrTag(t){ const e=document.getElementById("addrTag"); if(e) e.textContent=t; }

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
  const ok = current === SEPOLIA.chainId;
  document.getElementById("switchBtn").style.display = ok ? "none" : "inline-block";
  return ok;
}

async function switchToSepolia(){
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params:[{ chainId: SEPOLIA.chainId }] });
  } catch (e){
    if (e.code === 4902){
      await window.ethereum.request({ method: "wallet_addEthereumChain", params:[SEPOLIA] });
    } else throw e;
  }
}

async function connect(){
  log("connect() start");
  if (!window.ethereum){ alert("Install MetaMask (desktop) or use MetaMask mobile browser."); return; }
  if (!isValidAddress(CONTRACT_ADDRESS)){ setAddrTag("invalid"); setStatusTag("⚠️ bad CONTRACT_ADDRESS"); err("Invalid CONTRACT_ADDRESS."); return; }

  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddr = await signer.getAddress();
  setAddrTag(short(userAddr));

  setStatusTag((await ensureSepolia()) ? "Sepolia" : "Wrong network");

  const abi = await loadAbi();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  try { ownerAddr = await contract.owner(); } catch { ownerAddr = null; }
  try { isInstructorMe = await contract.isInstructor(userAddr); } catch { isInstructorMe = false; }

  // visibility
  document.getElementById("createPollCard").style.display = isInstructorMe ? "block" : "none";
  document.getElementById("manageAccessCard").style.display =
    (ownerAddr && ownerAddr.toLowerCase() === userAddr.toLowerCase()) ? "block" : "none";

  resetCreateForm();
  await renderInstructors(); // owner view (event-based list)
  await renderPolls();

  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}

/* ---------- Polls ---------- */
async function renderPolls(){
  const container = document.getElementById("polls");
  container.innerHTML = "Loading polls…";
  try {
    const count = Number(await contract.getPollCount());
    if (!count){ container.innerHTML = "<div class='muted'>No polls yet.</div>"; return; }
    const items = [];
    for (let i = 0; i < count; i++){
      const [question, options, votes, isOpen] = await contract.getPoll(i);
      if (!isOpen) continue; // hide closed polls
      const hasVoted = userAddr ? await contract.hasVoted(i, userAddr) : false;
      items.push(await renderPollCard(i, question, options, votes, isOpen, hasVoted));
    }
    container.innerHTML = items.length ? "" : "<div class='muted'>No open polls.</div>";
    items.forEach(el => container.appendChild(el));
  } catch (e) {
    container.innerHTML = `<div class="muted">Error loading polls: ${e?.shortMessage || e?.message || e}</div>`;
  }
}

async function renderPollCard(pollId, question, options, votes, isOpen, hasVoted){
  const card = document.createElement("div");
  card.className = "card";
  const total = votes.reduce((a,b)=> a + Number(b), 0);

  const list = options.map((opt, idx) => {
    const v = Number(votes[idx]);
    const pct = total ? Math.round((v/total)*100) : 0;
    const disabled = !isOpen || hasVoted;
    return `
      <div class="row" style="align-items:center; justify-content:space-between; gap:10px">
        <div style="flex:1">${opt}</div>
        <div class="pill">${v} ${total ? `(${pct}%)` : ""}</div>
        <button ${disabled ? "disabled" : ""} data-poll="${pollId}" data-idx="${idx}">Vote</button>
      </div>`;
  }).join("");

  const status = isOpen ? "Open" : "Closed";
  const you = hasVoted ? `<span class="tag">You already voted</span>` : "";
  const tools = isInstructorMe
    ? `<button class="iconbtn" data-close="${pollId}" title="Close poll">Close poll</button>`
    : "";

  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0; flex:1">${question}</h3>
      <div>
        <span class="tag">${status}</span>
        ${you}
        ${tools}
      </div>
    </div>
    <div style="margin-top:10px">${list}</div>
    <div class="activity" id="act-${pollId}"><div class="muted">Activity: loading…</div></div>
    <div class="muted" id="s-${pollId}" style="margin-top:8px"></div>
  `;

  card.querySelectorAll("button[data-poll]").forEach(btn => {
    if (btn.dataset.close !== undefined) return;
    btn.addEventListener("click", async () => {
      await castVote(Number(btn.dataset.poll), Number(btn.dataset.idx));
    });
  });

  const closeBtn = card.querySelector(`button[data-close="${pollId}"]`);
  if (closeBtn){
    closeBtn.addEventListener("click", async () => {
      const s = document.getElementById(`s-${pollId}`);
      try {
        s.textContent = "Closing poll…";
        const tx = await contract.closePoll(pollId);
        s.innerHTML = `Poll closing… <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a>`;
        await tx.wait();
        await renderPolls();
      } catch (e) {
        s.textContent = "Error: " + (e?.shortMessage || e?.message || e);
      }
    });
  }

  updateActivity(pollId, card.querySelector(`#act-${pollId}`)).catch(()=>{});
  return card;
}

async function castVote(pollId, optionIdx){
  const s = document.getElementById(`s-${pollId}`);
  try {
    s.textContent = "Sending transaction…";
    const tx = await contract.vote(pollId, optionIdx);
    s.innerHTML = `Vote sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    s.innerHTML += " ✓ confirmed";
    await renderPolls();
  } catch (e) {
    s.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
}

/* ---------- Activity (events) ---------- */
async function updateActivity(pollId, mountEl){
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 200000);
  const tCreated = ethers.id("PollCreated(uint256,string,string[])");
  const tVoted   = ethers.id("VoteCast(uint256,address,uint256)");
  const topicId  = ethers.zeroPadValue(ethers.toBeHex(pollId), 32);

  const [logsCreated, logsVoted] = await Promise.all([
    provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock, toBlock: "latest", topics: [tCreated, topicId] }),
    provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock, toBlock: "latest", topics: [tVoted,   topicId] })
  ]);

  const createdRow = logsCreated.length
    ? `<li>Poll created — <a target="_blank" href="https://sepolia.etherscan.io/tx/${logsCreated[0].transactionHash}">${short(logsCreated[0].transactionHash)}</a></li>`
    : `<li class="muted">Poll created — not in recent window</li>`;

  const iface = contract.interface;
  const voteRows = logsVoted.map(l => {
    const parsed = iface.parseLog(l);
    const voter = parsed.args[1];
    return `<li>Vote by ${short(voter)} — <a target="_blank" href="https://sepolia.etherscan.io/tx/${l.transactionHash}">${short(l.transactionHash)}</a></li>`;
  }).join("");

  mountEl.innerHTML = `
    <div><strong>Activity</strong></div>
    <ul style="margin:6px 0 0 18px; padding:0">
      ${createdRow}
      ${voteRows || `<li class="muted">No votes yet</li>`}
    </ul>`;
}

/* ---------- Instructor Management (owner) ---------- */
async function renderInstructors(){
  const card = document.getElementById("manageAccessCard");
  if (card.style.display === "none") return; // not owner

  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 500000);
  const tAdd = ethers.id("InstructorAdded(address)");
  const tRm  = ethers.id("InstructorRemoved(address)");

  const [adds, rms] = await Promise.all([
    provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock, toBlock: "latest", topics: [tAdd] }),
    provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock, toBlock: "latest", topics: [tRm]  })
  ]);

  const set = new Map(); // addr -> present?
  adds.forEach(log => set.set(ethers.getAddress(ethers.dataSlice(log.topics[1], 12)), true));
  rms.forEach(log  => set.set(ethers.getAddress(ethers.dataSlice(log.topics[1], 12)), false));

  const active = [...set.entries()].filter(([,v])=>v).map(([k])=>k);
  const listEl = document.getElementById("instrList");
  listEl.innerHTML = active.length
    ? active.map(a => `${a}${ownerAddr && a.toLowerCase()===ownerAddr.toLowerCase() ? "  (owner)" : ""}`).join("<br/>")
    : "<span class='muted'>No instructors found in recent event window.</span>";
}

document.getElementById("addInstrBtn").addEventListener("click", async () => {
  const addr = document.getElementById("instrAddr").value.trim();
  const status = document.getElementById("manageStatus");
  if (!isValidAddress(addr)) { status.textContent = "Enter a valid 0x address."; return; }
  try {
    status.textContent = "Adding…";
    const tx = await contract.addInstructor(addr);
    status.innerHTML = `Tx: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a>`;
    await tx.wait();
    await renderInstructors();
  } catch (e) {
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

document.getElementById("rmInstrBtn").addEventListener("click", async () => {
  const addr = document.getElementById("instrAddr").value.trim();
  const status = document.getElementById("manageStatus");
  if (!isValidAddress(addr)) { status.textContent = "Enter a valid 0x address."; return; }
  try {
    status.textContent = "Removing…";
    const tx = await contract.removeInstructor(addr);
    status.innerHTML = `Tx: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a>`;
    await tx.wait();
    await renderInstructors();
  } catch (e) {
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

/* ---------- Create Poll UI ---------- */
function makeOptionRow(value=""){
  const div = document.createElement("div");
  div.className = "option";
  div.innerHTML = `
    <input placeholder="Option" value="${value.replace(/"/g,'&quot;')}" />
    <button class="iconbtn btn-remove" title="Remove option">−</button>`;
  const wrap = document.getElementById("optionsWrap");
  wrap.appendChild(div);
  syncRemoveButtons();
  div.querySelector(".btn-remove").addEventListener("click", () => {
    const count = wrap.querySelectorAll("input").length;
    if (count <= 2) return; // keep >=2
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
  document.getElementById("createStatus").textContent = "";
}

document.getElementById("addOptBtn").addEventListener("click", () => {
  const wrap = document.getElementById("optionsWrap");
  if (wrap.querySelectorAll("input").length >= 10) { alert("Max 10 options."); return; }
  makeOptionRow("");
});

document.getElementById("resetBtn").addEventListener("click", resetCreateForm);

document.getElementById("createBtn").addEventListener("click", async () => {
  const q = document.getElementById("question").value.trim();
  const inputs = [...document.querySelectorAll("#optionsWrap input")];
  const opts = inputs.map(i => i.value.trim()).filter(Boolean);
  const status = document.getElementById("createStatus");

  if (!q || opts.length < 2) { status.textContent = "Enter a question and at least two non-empty options."; return; }
  try {
    status.textContent = "Creating poll…";
    const tx = await contract.createPoll(q, opts);
    status.innerHTML = `Poll creation sent: <a target="_blank" href="https://sepolia.etherscan.io/tx/${tx.hash}">${tx.hash}</a> (waiting…)`;
    await tx.wait();
    status.innerHTML += " ✓ created";
    resetCreateForm();
    await renderPolls();
  } catch (e) {
    status.textContent = "Error: " + (e?.shortMessage || e?.message || e);
  }
});

/* ---------- Top bar ---------- */
document.getElementById("connectBtn").addEventListener("click", connect);
document.getElementById("switchBtn").addEventListener("click", async () => { await switchToSepolia(); await connect(); });

setAddrTag("script-ok");
if (window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" })
    .then(accts => { if (accts && accts.length) connect(); });
}
