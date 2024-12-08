require('dotenv').config();
const { ethers } = require('ethers');
const express = require('express');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'totals.log' })
  ]
});

const createFailoverProvider = (rpcEndpoints) => {
  let currentIndex = 0;

  const getProvider = () => new ethers.providers.JsonRpcProvider(rpcEndpoints[currentIndex]);

  const switchProvider = () => {
    currentIndex = (currentIndex + 1) % rpcEndpoints.length;
    logger.warn(`Switching to provider: ${rpcEndpoints[currentIndex]}`);
  };

  const sendRequest = async (method, params = []) => {
    const provider = getProvider();
    try {
      return await provider.send(method, params);
    } catch (error) {
      logger.error(`Provider error: ${error.message}. Switching provider...`);
      switchProvider();
      const newProvider = getProvider();
      return await newProvider.send(method, params);
    }
  };

  return { getProvider, sendRequest };
};

const networks = {
  Cypherium: {
    provider: createFailoverProvider([process.env.CYPHERIUM_RPC_URL, process.env.CYPHERIUM_BACKUP_RPC_URL]),
    contractAddress: process.env.CYPHERIUM_LOCK_UNLOCK_CONTRACT_ADDRESS,
  },
  ETH: {
    provider: createFailoverProvider([process.env.ETH_RPC_URL, process.env.ETH_BACKUP_RPC_URL]),
    contractAddress: process.env.ETH_MINT_BURN_CONTRACT_ADDRESS,
  },
  XDC: {
    provider: createFailoverProvider([process.env.XDC_RPC_URL, process.env.XDC_BACKUP_RPC_URL]),
    contractAddress: process.env.XDC_MINT_BURN_CONTRACT_ADDRESS,
  },
  BNB: {
    provider: createFailoverProvider([process.env.BNB_RPC_URL, process.env.BNB_BACKUP_RPC_URL]),
    contractAddress: process.env.BNB_MINT_BURN_CONTRACT_ADDRESS,
  }
};

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)" 
];

const getTotalLocked = async () => {
  try {
    const provider = networks.Cypherium.provider.getProvider();
    const contractAddress = networks.Cypherium.contractAddress;
    const balance = await provider.getBalance(contractAddress);
    logger.info(`Total Locked on Cypherium: ${ethers.utils.formatEther(balance)} CPH`);
    return balance;
  } catch (error) {
    logger.error('Failed to fetch total locked amount on Cypherium:', error);
    throw new Error('Failed to fetch total locked amount on Cypherium');
  }
};

const getTotalMinted = async () => {
  try {
    const supplies = await Promise.all(['ETH', 'XDC', 'BNB'].map(async (network) => {
      const provider = networks[network].provider.getProvider();
      const contractAddress = networks[network].contractAddress;
      const tokenContract = new ethers.Contract(contractAddress, erc20Abi, provider);
      const supply = await tokenContract.totalSupply(); 
      logger.info(`${network} Total Minted (Max Supply): ${ethers.utils.formatUnits(supply, 18)} wCPH`);
      return supply;
    }));

    const totalMinted = supplies.reduce((acc, supply) => acc.add(supply), ethers.BigNumber.from(0));
    return totalMinted;
  } catch (error) {
    logger.error('Failed to fetch total minted amount:', error);
    throw new Error('Failed to fetch total minted amount');
  }
};

const app = express();

app.get('/api/totals', async (req, res) => {
  try {
    const totalLocked = await getTotalLocked();
    const totalMinted = await getTotalMinted();

    res.json({
      totalLocked: ethers.utils.formatEther(totalLocked),
      totalMinted: ethers.utils.formatUnits(totalMinted, 18)
    });

    logger.info(`API Totals - Locked: ${ethers.utils.formatEther(totalLocked)} CPH, Total Minted: ${ethers.utils.formatUnits(totalMinted, 18)} wCPH`);
  } catch (error) {
    logger.error('Error fetching totals:', error);
    res.status(500).json({ error: 'Failed to fetch totals' });
  }
});

const PORT = process.env.PORT || yourport;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
