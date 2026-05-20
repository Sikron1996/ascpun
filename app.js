// Встав сюди адресу контракту після deploy
const CONTRACT_ADDRESS = "0xbE117E1d7332f1834afe826c2069d9499aC1Eef6";

const ABI = [
  "function mint(uint256 amount) external payable",
  "function PRICE() view returns (uint256)",
  "function minted(address user) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const MAINNET = "0x1";
const MAX_SUPPLY = 10000;
const DEFAULT_PRICE_ETH = "0.0001";

let provider, signer, contract, account;
let cachedPriceWei = null;
let cachedAlreadyMinted = 0n;

const walletEl = document.getElementById("wallet");
const statusEl = document.getElementById("status");
const amountInput = document.getElementById("amountInput");
const progressBar = document.getElementById("progressBar");
const mintedText = document.getElementById("mintedText");
const priceText = document.getElementById("priceText");
const galleryEl = document.getElementById("gallery");

function status(msg){ statusEl.textContent = msg; }

function ipfsToHttp(uri){
  if(!uri) return uri;
  if(uri.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + uri.replace("ipfs://","");
  return uri;
}

function getAmount(){
  let amount = Number(amountInput.value);
  if(!Number.isInteger(amount) || amount < 1) amount = 1;
  if(amount > 30) amount = 30;
  amountInput.value = amount;
  return amount;
}

async function refreshPrice(){
  try{
    const amount = BigInt(getAmount());

    if(contract && account){
      cachedAlreadyMinted = await contract.minted(account);
      cachedPriceWei = await contract.PRICE();
    }

    if(!cachedPriceWei){
      if(amount === 1n){
        priceText.textContent = "FREE";
      } else {
        const paid = Number(amount - 1n);
        priceText.textContent = (paid * Number(DEFAULT_PRICE_ETH)).toFixed(4).replace(/0+$/,'').replace(/\.$/,'') + " ETH";
      }
      return;
    }

    let paidAmount = amount;
    if(cachedAlreadyMinted === 0n){
      paidAmount = paidAmount > 0n ? paidAmount - 1n : 0n;
    }

    priceText.textContent = paidAmount === 0n ? "FREE" : ethers.formatEther(cachedPriceWei * paidAmount) + " ETH";
  }catch(e){
    console.error(e);
  }
}

async function connect(){
  try{
    if(!window.ethereum) throw new Error("Wallet not found");
    if(CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE") throw new Error("Встав адресу контракту в app.js");

    const chainId = await window.ethereum.request({ method:"eth_chainId" });
    if(chainId !== MAINNET){
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: MAINNET }] });
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    account = accounts[0];
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    walletEl.textContent = account.slice(0,6) + "..." + account.slice(-4);
    status("Connected");
    await loadProgress();
    await refreshPrice();
  }catch(e){
    console.error(e);
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function loadProgress(){
  try{
    if(!contract) return;
    const supply = await contract.totalSupply();
    const minted = Number(supply);
    mintedText.textContent = minted + " / " + MAX_SUPPLY;
    progressBar.style.width = Math.min(100, minted / MAX_SUPPLY * 100) + "%";
  }catch(e){ console.error(e); }
}

async function mint(){
  try{
    if(!contract) await connect();

    const amount = getAmount();
    const alreadyMinted = await contract.minted(account);
    const price = await contract.PRICE();

    let paidAmount = BigInt(amount);
    if(alreadyMinted === 0n) paidAmount = paidAmount > 0n ? paidAmount - 1n : 0n;

    const value = price * paidAmount;

    status("Confirm mint in wallet...");
    const tx = await contract.mint(amount, { value });
    status("Transaction sent: " + tx.hash);
    await tx.wait();
    status("Mint success!");
    await loadProgress();
    await refreshPrice();
    await loadGallery();
  }catch(e){
    console.error(e);
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function loadGallery(){
  try{
    if(!contract) await connect();
    galleryEl.innerHTML = "<p class='galleryNote'>Loading minted NFTs...</p>";

    const supply = Number(await contract.totalSupply());
    if(supply === 0){
      galleryEl.innerHTML = "<p class='galleryNote'>No minted NFTs yet.</p>";
      return;
    }

    const start = Math.max(0, supply - 20);
    const ids = [];
    for(let i = supply - 1; i >= start; i--) ids.push(i);

    const cards = await Promise.all(ids.map(async (id) => {
      try{
        const uri = await contract.tokenURI(id);
        const metaRes = await fetch(ipfsToHttp(uri));
        const meta = await metaRes.json();
        const img = ipfsToHttp(meta.image);
        const name = meta.name || ("AsciiPunk #" + id);
        return `<article class="nftCard"><img src="${img}" alt="${name}"><div>${name}<small>Token #${id}</small></div></article>`;
      }catch(e){
        console.error(e);
        return `<article class="nftCard"><div>Token #${id}<small>Metadata loading...</small></div></article>`;
      }
    }));

    galleryEl.innerHTML = cards.join("");
  }catch(e){
    console.error(e);
    galleryEl.innerHTML = "<p class='galleryNote'>Gallery error: " + (e.shortMessage || e.message) + "</p>";
  }
}

document.getElementById("connectBtn").onclick = connect;
document.getElementById("mintBtn").onclick = mint;
document.getElementById("loadGalleryBtn").onclick = loadGallery;

document.getElementById("minusBtn").onclick = async () => {
  amountInput.value = Math.max(1, Number(amountInput.value || 1) - 1);
  await refreshPrice();
};

document.getElementById("plusBtn").onclick = async () => {
  amountInput.value = Math.min(30, Number(amountInput.value || 1) + 1);
  await refreshPrice();
};

amountInput.oninput = refreshPrice;
refreshPrice();

document.querySelectorAll(".thumbs img").forEach(img => {
  img.onclick = () => {
    document.getElementById("mainImg").src = img.dataset.img;
    document.querySelectorAll(".thumbs img").forEach(x => x.classList.remove("active"));
    img.classList.add("active");
  };
});
