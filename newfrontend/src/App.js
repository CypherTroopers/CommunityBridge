import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import FeeExplanation from "./FeeExplanation";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [balance, setBalance] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [waitingMessage, setWaitingMessage] = useState('');
  const [fromChain, setFromChain] = useState('');
  const [toChain, setToChain] = useState('');
  const [fromAsset, setFromAsset] = useState('');
  const [toAsset, setToAsset] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lockUnlockAbi, setLockUnlockAbi] = useState(null);
  const [mintBurnAbi, setMintBurnAbi] = useState(null);
  const [totalLocked, setTotalLocked] = useState(null);
  const [totalMinted, setTotalMinted] = useState(null);
  const [completionMessage, setCompletionMessage] = useState(''); 
  const [isViewOnly, setIsViewOnly] = useState(true);
  const erc20Abi = ["function balanceOf(address owner) view returns (uint256)"];
  const [actualReceived, setActualReceived] = useState(0);
  const [tokenType, setTokenType] = useState('');
const networks = {
  "Cypherium": { "chainId": 16166, "name": "Cypherium", "asset": "CPH", "lockContractAddress": "Your ContractAddress" },
  "XDC": { "chainId": 50, "burnContractAddress": "Your ContractAddress", "name": "XDC", "asset": "wCPH" },
  "ETH": { "chainId": 1, "burnContractAddress": "Your ContractAddress", "name": "ETH", "asset": "wCPH" },
  "BNB": { "chainId": 56, "burnContractAddress": "Your ContractAddress", "name": "BNB", "asset": "wCPH" }
};

  useEffect(() => {
    const fetchAbis = async () => {
      try {
        const lockUnlockAbiResponse = await fetch(`${process.env.}/LockUnlock.abi.json`);
        const lockUnlockAbiData = await lockUnlockAbiResponse.json();
        setLockUnlockAbi(lockUnlockAbiData);

        const mintBurnAbiResponse = await fetch(`${process.env.}/MintBurn.abi.json`);
        const mintBurnAbiData = await mintBurnAbiResponse.json();
        setMintBurnAbi(mintBurnAbiData);
      } catch (error) {
        console.error("Failed to fetch ABI files:", error);
        setErrorMessage("Failed to load ABI files. Please try again.");
      }
    };
    fetchAbis();
  }, []);

useEffect(() => {
  const fetchTotals = async () => {
    try {

      const response = await axios.get('/api/totals');
      setTotalLocked(response.data.totalLocked);
      setTotalMinted(response.data.totalMinted);
    } catch (error) {
      console.error('Error fetching totals:', error);
    }
  };

  fetchTotals();
}, []);

const fetchTokenBalance = async (tokenAddress) => {
  if (!signer) {
    setBalance(ethers.BigNumber.from("0"));
    setErrorMessage("Failed to fetch balance: Invalid signer.");
    return;
  }

  try {
    let tokenBalance;
    if (fromChain === 'Cypherium') {
      const nativeBalance = await signer.getBalance();
      tokenBalance = nativeBalance;
    } else if (tokenAddress) {
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
      tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
    } else {
      tokenBalance = ethers.BigNumber.from("0");
    }

    setBalance(tokenBalance);
  } catch (error) {
    setBalance(ethers.BigNumber.from("0"));
    setErrorMessage(`Failed to fetch balance: ${error.message}`);
  }
};

useEffect(() => {
  if (fromChain && signer) {
    const tokenAddress = networks[fromChain]?.burnContractAddress;
    fetchTokenBalance(tokenAddress);
  }
}, [fromChain, signer]);

const [lockAmount, setLockAmount] = useState('');
const [burnAmount, setBurnAmount] = useState('');
const updateReceivedAmount = (amount, selectedToChain) => {
  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    setActualReceived(0);
    setErrorMessage("");
    return;
  }

  const networkFees = {
    ETH: 700,
    BNB: 5,
    XDC: 0,
  };

  const percentageFee = parsedAmount * 0.001;

  const networkFee = networkFees[selectedToChain] || 0;

  const actualAmount = parsedAmount - percentageFee - networkFee;

  const minimumAmount = 10000;

  if (actualAmount < minimumAmount) {
    setActualReceived(actualAmount);
    setErrorMessage(
      `Error: Minimum lock amount after fees is ${minimumAmount} CPH.`
    );
  } else {
    setActualReceived(actualAmount);
    setErrorMessage("");
  }
};
const handleMaxButtonClick = () => {
  if (!balance || balance.isZero()) {
    setErrorMessage("Balance not available. Please connect your wallet.");
    return;
  }

  const balanceToUse = ethers.utils.formatUnits(balance, 18);

  if (fromChain === 'Cypherium') {
    setLockAmount(balanceToUse); 
  } else {
    setBurnAmount(balanceToUse);
  }
};

const connectWallet = async (chainId) => {
  if (!window.ethereum) {
    setErrorMessage("MetaMask is not installed.");
    return;
  }

  try {
    const hexChainId = `0x${parseInt(chainId, 10).toString(16)}`;

    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });

    const tempProvider = new ethers.providers.Web3Provider(window.ethereum);
    await tempProvider.send("eth_requestAccounts", []);
    const tempSigner = tempProvider.getSigner();
    const userAddress = await tempSigner.getAddress();

    setProvider(tempProvider);
    setSigner(tempSigner);
    setWalletAddress(userAddress);
    setErrorMessage('');
    await fetchTokenBalance(networks[fromChain]?.burnContractAddress);
  } catch (error) {
    setErrorMessage(
      error.code === 4902
        ? "Network not available in MetaMask. Please add it manually."
        : `Failed to connect wallet or switch network. Error: ${error.message}`
    );
  }
};

  const handleFromChainChange = async (event) => {
    const selectedChain = event.target.value;
    setFromChain(selectedChain);
    setFromAsset(networks[selectedChain]?.asset || '');
    setResponseMessage('');
    setErrorMessage('');
    setWaitingMessage('');

    const networkConfig = networks[selectedChain];
    if (networkConfig) {
      await connectWallet(networkConfig.chainId);
    } else {
      setErrorMessage("Unsupported network selected.");
    }

    if (selectedChain === 'Cypherium') {
      setToChain('');
      setToAsset('');
    }
  };

const handleToChainChange = (event) => {
  const selectedChain = event.target.value;
  setToChain(selectedChain);

  setTokenType(selectedChain);

  console.log("Selected toChain:", selectedChain);
  setToAsset(networks[selectedChain]?.asset || '');
  updateReceivedAmount(lockAmount, selectedChain);
};

  const isLockEnabled = fromChain === 'Cypherium';
  const isBurnEnabled = ['XDC', 'ETH', 'BNB'].includes(fromChain);

const handleLock = async (event) => {
  event.preventDefault();
  setResponseMessage('');
  setErrorMessage('');
  setWaitingMessage('Bridge Transaction is being confirmed. Please wait a moment.');
  setIsLoading(true);
  setIsComplete(false);

  const amount = lockAmount;
  const token = tokenType;
  const parsedAmount = ethers.utils.parseEther(amount);

  if (!fromChain) {
    setErrorMessage("Please select a valid From Chain.");
    setIsLoading(false);
    return;
  }

  if (!tokenType || !['ETH', 'BNB', 'XDC'].includes(tokenType)) {
    setErrorMessage("Please select a valid token type (ETH, BNB, XDC).");
    setIsLoading(false);
    return;
  }

  try {
    const network = await provider.getNetwork();
    if (network.chainId !== networks[fromChain]?.chainId) {
      throw new Error(`Please connect to the ${fromChain} network to perform this action.`);
    }

    const lockUnlockContract = new ethers.Contract(
      networks[fromChain].lockContractAddress,
      lockUnlockAbi,
      signer
    );

    if (parsedAmount.lt(ethers.utils.parseEther("10000"))) {
      setErrorMessage("Amount must be greater than or equal to the minimum lock limit of 10000 CPH.");
      setIsLoading(false);
      return;
    }

    const txResponse = await lockUnlockContract.lock(tokenType, {
      value: parsedAmount,
      gasLimit: ethers.utils.hexlify(500000),
      gasPrice: ethers.utils.parseUnits('20', 'gwei'),
    });

    await txResponse.wait();

    const backendResponse = await fetch('/api/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: toChain,
        user: walletAddress,
        transactionHash: txResponse.hash,
        tokenType,
      }),
    });

    const responseData = await backendResponse.json();

    if (responseData.success) {
      setResponseMessage(`Bridge transaction successful! Mint transaction hash: ${responseData.txHash}`);
      setCompletionMessage("ALL DONE! Check your wallet!");
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      setIsComplete(true);
    } else {
      throw new Error(responseData.error || 'Minting process failed.');
    }

  } catch (error) {
    console.error("Transaction Error:", error);
    setErrorMessage(error.message);
  } finally {
    setIsLoading(false);
    setWaitingMessage('');
  }
};

const handleBurn = async (event) => {
  event.preventDefault();
  setResponseMessage('');
  setErrorMessage('');
  setWaitingMessage('Burn transaction is being confirmed. Please wait a moment.');
  setIsLoading(true);
  setIsComplete(false);

  const amount = document.getElementById('burnAmount').value;
  const parsedAmount = ethers.utils.parseEther(amount);

  if (!fromChain) {
    setErrorMessage("Please select a valid From Chain.");
    setIsLoading(false);
    return;
  }

  if (!parsedAmount || parsedAmount.isZero()) {
    setErrorMessage("Invalid burn amount.");
    setIsLoading(false);
    return;
  }

  try {
    const network = await provider.getNetwork();
    const networkConfig = Object.values(networks).find(n => n.chainId === network.chainId);

    if (!networkConfig) {
      throw new Error("Please connect to a supported network to perform this action.");
    }

    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

    const burnContract = new ethers.Contract(
      networkConfig.burnContractAddress,
      mintBurnAbi,
      signer
    );

    console.log("Sending burn transaction...");
    const tx = await burnContract.burn(parsedAmount);
    console.log(`Burn transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`Burn transaction confirmed: ${tx.hash}`);

    console.log("Sending burn transaction details to API...");
    const backendResponse = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: fromChain,
        user: walletAddress,
        amount: parsedAmount.toString(),
        transactionHash: tx.hash,
      }),
    });

    const responseData = await backendResponse.json();

    if (responseData.success) {
      setResponseMessage(`Unlock transaction successful! Transaction hash: ${responseData.txHash}`);
      setCompletionMessage("ALL DONE! Check your wallet!");
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      setIsComplete(true);
    } else {
      throw new Error(responseData.error || "Unlock process failed.");
    }

  } catch (error) {
    console.error("Transaction Error:", error);
    setErrorMessage(error.message);
  } finally {
    setIsLoading(false);
    setWaitingMessage('');
  }
};
return (
  <>
    {/* UI Rendering */}
    {isLoading && (
      <div className="overlay">
        <div className="spinner"></div>
        <p style={{ marginBottom: "200px", textAlign: "center" }}>
          Bridge transaction is being confirmed.<br />
          Please wait until 'ALL DONE' is displayed.<br />
          Verification may take several minutes depending on the network status.
        </p>
      </div>
    )}

    {/* Completion Message */}
    {completionMessage && (
      <div className="overlay">
        <p style={{ marginBottom: "200px", textAlign: "center", fontSize: "24px", fontWeight: "bold" }}>
          {completionMessage}
        </p>
      </div>
    )}

    <header className="bridge-header">
      <h1>Cypherium Community Bridge</h1>
      {/* */}
<div className="token-links">
  <a href="https://xdcscan.com/token/0xe084FFE165fBfbD376f5b3046B56FF4F00fDf73f" target="_blank" rel="noopener noreferrer">
    <img src="https://maroon-proud-cod-903.mypinata.cloud/ipfs/QmfRfHSWmjh5dC2AjGQ78BfZFkL2ch2kU2q1NSaWeSZC5C?pinataGatewayToken=cTSFGarZKrQBYaNWIpSmlyFsuBoJ_LyocJ85LhvCU7kd4PKJYXMW6edUPjYdhYDs" alt="XDC logo" className="token-logo" />
    wCPH on XDC Click Here
  </a>
  <a href="https://etherscan.io/token/0x07A7dc47d675c2A907c926BBc5F59bb3Bd144796" target="_blank" rel="noopener noreferrer">
    <img src="https://maroon-proud-cod-903.mypinata.cloud/ipfs/QmYD6DSu6VoZ7otcYiEsNeN5MJ3nhTrwnQrNREoYhQuZFB?pinataGatewayToken=cTSFGarZKrQBYaNWIpSmlyFsuBoJ_LyocJ85LhvCU7kd4PKJYXMW6edUPjYdhYDs" alt="ETH logo" className="token-logo" />
    wCPH on ETH Click Here
  </a>
  <a href="https://bscscan.com/token/0x7642A3D428CD84455dc0626837d98C51149e6d2A" target="_blank" rel="noopener noreferrer">
    <img src="https://maroon-proud-cod-903.mypinata.cloud/ipfs/QmUNBaNZrtANTcdQCmWgA7SHbdyCe355ssbX3ZYzwnNeny?pinataGatewayToken=cTSFGarZKrQBYaNWIpSmlyFsuBoJ_LyocJ85LhvCU7kd4PKJYXMW6edUPjYdhYDs" alt="BNB logo" className="token-logo" />
    wCPH on BNB Click Here
  </a>
  <a href="https://cypherium.tryethernal.com/address/0x4f0df59d54a8f44fb78e336baaf6ef0335dd3216?tab=transactions" target="_blank" rel="noopener noreferrer">
    <img src="https://gateway.pinata.cloud/ipfs/QmPakSk2tg3gDyCUq3FUL4uu6JTyaszFeM7eXKwVsRFuhA" alt="BNB logo" className="token-logo" />
    Locked CPH Click Here
  </a>
</div>
      <div className="token-stats">
        <p><strong>Proof of 1:1 backing </strong></p>
        <p><strong>Total Locked:</strong> {totalLocked ? totalLocked : 'Loading...'}</p>
        <p><strong>Total Minted:</strong> {totalMinted ? totalMinted : 'Loading...'}</p>
      </div>
      <p>Connect your wallet and start transferring assets between networks.</p>
    </header>
    
      <FeeExplanation />
   
    {walletAddress && (
      <div className="wallet-info">
        <p>Connected Wallet: {walletAddress}</p>
      </div>
    )}

    <div className="bridge-body">
      <div className="network-selection">
        <h2>From Chain</h2>
        <select onChange={handleFromChainChange} className="form-select">
          <option value="">-- Select From Chain --</option>
          {Object.keys(networks).map(network => (
            <option key={network} value={network}>
              {networks[network].name}
            </option>
          ))}
        </select>

        {fromChain && (
          <>
            <h2>From Asset</h2>
            <input type="text" value={fromAsset} readOnly className="form-control" />
          </>
        )}
      </div>

      {fromChain && (
        <div className="transaction-form">
          <h2>To Chain</h2>
          <select onChange={handleToChainChange} className="form-select">
            <option value="">-- Select To Chain --</option>
            {fromChain === 'Cypherium'
              ? ['XDC', 'ETH', 'BNB'].map(chain => (
                  <option key={chain} value={chain}>
                    {networks[chain]?.name}
                  </option>
                ))
              : ['Cypherium'].map(chain => (
                  <option key={chain} value={chain}>
                    {networks[chain]?.name}
                  </option>
                ))}
          </select>

          {toChain && (
            <>
              <h2>To Asset</h2>
              <input type="text" value={toAsset} readOnly className="form-control" />
            </>
          )}

{isLockEnabled && (
  <>
    <h2>Amount to Bridge</h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          id="lockAmount"
          name="lockAmount"
          type="text"
          placeholder="Amount"
          className="form-control"
          required
          value={lockAmount}
          onChange={(e) => {
            setLockAmount(e.target.value);
            updateReceivedAmount(e.target.value, toChain);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleMaxButtonClick}
        >
          MAX
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
        <label htmlFor="tokenType">Selected Network Type:</label>
        <input
          id="tokenType"
          name="tokenType"
          type="text"
          className="form-control"
          readOnly
          value={tokenType || '--Select a To Chain First--'}
        />
      </div>

      <div style={{ marginTop: '10px' }}>
        <p>Actual Amount Received: {actualReceived.toFixed(4)} wCPH</p>
        {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
      </div>

      <button className="btn btn-primary" onClick={handleLock}>
        Receive wCPH
      </button>
    </div>
  </>
)}

{isBurnEnabled && (
  <>
    <h2>Amount to Bridge</h2>
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <input
        id="burnAmount"
        name="burnAmount"
        type="text"
        placeholder="Amount"
        className="form-control"
        required
        value={burnAmount}
        onChange={(e) => setBurnAmount(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleMaxButtonClick}
      >
        MAX
      </button>
    </div>
    <button className="btn btn-danger" onClick={handleBurn}>
      Receive CPH
    </button>
  </>
)}

        </div>
      )}
    </div>

<footer className="footer"> 
  <div className="contact-info">
    <span>Contact:</span>
    <a href="https://t.me/kj0551" target="_blank" rel="noopener noreferrer">
      <i className="fab fa-telegram"></i> Telegram
    </a>
    <a href="mailto:make-cph-great-again-mcga@funoncypherium.org">
      <i className="fas fa-envelope"></i> Email
    </a>
  </div>
  &copy; 2024 Cypherium Community. All Rights Reserved.
</footer>
  </>
);
}


export default App;
