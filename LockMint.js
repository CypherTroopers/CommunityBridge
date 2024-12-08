require('dotenv').config();
const { ethers } = require('ethers');
const mongoose = require('mongoose');
const winston = require('winston');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'lockMint.log' })
  ]
});

const connectToMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    setTimeout(connectToMongoDB, 5000);
  }
};

connectToMongoDB();

const transactionSchema = new mongoose.Schema({
  user: String,
  network: String,
  action: String,
  amount: String,
  status: { type: String, default: 'pending' },
  retries: { type: Number, default: 0 },
  txHash: String,
  error: String,
  timestamp: { type: Date, default: Date.now },
});

const Transaction = mongoose.model('Transaction', transactionSchema);

const createFailoverProvider = (rpcEndpoints) => {
  let currentIndex = 0;

  const getProvider = () => new ethers.providers.JsonRpcProvider(rpcEndpoints[currentIndex]);

  const switchProvider = () => {
    currentIndex = (currentIndex + 1) % rpcEndpoints.length;
    logger.info(`Switching to provider: ${rpcEndpoints[currentIndex]}`);
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
    chainId: 16166,
    provider: createFailoverProvider([process.env.CYPHERIUM_RPC_URL, process.env.CYPHERIUM_BACKUP_RPC_URL]),
    lockUnlockContractAddress: process.env.CYPHERIUM_LOCK_UNLOCK_CONTRACT_ADDRESS,
    signer: null
  },
  XDC: {
    chainId: 50,
    provider: createFailoverProvider([process.env.XDC_RPC_URL, process.env.XDC_BACKUP_RPC_URL]),
    mintBurnContractAddress: process.env.XDC_MINT_BURN_CONTRACT_ADDRESS,
    signer: null
  },
  ETH: {
    chainId: 1,
    provider: createFailoverProvider([process.env.ETH_RPC_URL, process.env.ETH_BACKUP_RPC_URL]),
    mintBurnContractAddress: process.env.ETH_MINT_BURN_CONTRACT_ADDRESS,
    signer: null
  },
  BNB: {
    chainId: 56,
    provider: createFailoverProvider([process.env.BNB_RPC_URL, process.env.BNB_BACKUP_RPC_URL]),
    mintBurnContractAddress: process.env.BNB_MINT_BURN_CONTRACT_ADDRESS,
    signer: null
  }
};

Object.keys(networks).forEach(network => {
  networks[network].signer = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    networks[network].provider.getProvider()
  );
});

const mintBurnAbi = require('abi.json');
const lockUnlockAbi = require('abi.json');

const getLockedAmountFromEvent = async (transactionHash) => {
  const provider = networks.Cypherium.provider.getProvider();
  const receipt = await provider.getTransactionReceipt(transactionHash);

  if (!receipt) {
    throw new Error('Transaction receipt not found.');
  }

  if (receipt.status !== 1) {
    throw new Error('Transaction failed on-chain.');
  }

  const lockUnlockInterface = new ethers.utils.Interface(lockUnlockAbi);
  const eventSignature = lockUnlockInterface.getEventTopic('Locked');
  const log = receipt.logs.find(log =>
    log.address.toLowerCase() === networks.Cypherium.lockUnlockContractAddress.toLowerCase() &&
    log.topics[0] === eventSignature
  );

  if (!log) {
    throw new Error('Lock event not found in transaction logs.');
  }

  const parsedLog = lockUnlockInterface.parseLog(log);

  if (!parsedLog.args.netAmount || parsedLog.args.netAmount.isZero()) {
    throw new Error('Invalid or missing netAmount in lock event.');
  }

  return parsedLog.args.netAmount;
};

const mintTokens = async (network, user, amount) => {
  const provider = networks[network].provider.getProvider();
  const mintBurnContract = new ethers.Contract(
    networks[network].mintBurnContractAddress,
    mintBurnAbi,
    networks[network].signer
  );

  const gasPrice = await provider.getGasPrice();
  const adjustedGasPrice = gasPrice.mul(ethers.BigNumber.from(15)).div(10);

  const tx = await mintBurnContract.mint(user, amount, {
    gasLimit: 1300000,
    gasPrice: adjustedGasPrice
  });

  await tx.wait();
  return tx;
};

const app = express();
app.use(helmet());

const corsOptions = {
  origin: your domain',
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

app.post('/api/mint', async (req, res) => {
  const { network, user, transactionHash, tokenType } = req.body;

  logger.info('Received mint request', {
    network,
    user,
    transactionHash,
    tokenType,
  });

  if (!['XDC', 'BNB', 'ETH'].includes(network)) {
    logger.error('Unsupported network requested', { network });
    return res.status(400).json({ success: false, error: 'Unsupported network.' });
  }

  try {
    logger.info('Fetching locked amount for transaction', { transactionHash });
    const lockedAmount = await getLockedAmountFromEvent(transactionHash);
    logger.info('Locked amount fetched successfully', {
      transactionHash,
      lockedAmount: lockedAmount.toString(),
    });

    logger.info('Starting mint process', { network, user, lockedAmount: lockedAmount.toString() });
    const mintTx = await mintTokens(network, user, lockedAmount);
    logger.info('Mint transaction successful', { txHash: mintTx.hash });

    res.json({ success: true, txHash: mintTx.hash });
  } catch (error) {
    logger.error('Error during mint process', {
      message: error.message,
      stack: error.stack,
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

const retryFailedTransactions = async () => {
  const failedTransactions = await Transaction.find({ status: 'failed', retries: { $lt: 3 } });

  for (const tx of failedTransactions) {
    try {
      const mintTx = await mintTokens(tx.network, tx.user, ethers.BigNumber.from(tx.amount));
      tx.status = 'success';
      tx.txHash = mintTx.hash;
      await tx.save();
    } catch (error) {
      tx.retries += 1;
      tx.error = error.message;
      await tx.save();
    }
  }
};

setInterval(retryFailedTransactions, 60000);

const PORT = process.env.LOCK_MINT_PORT || yourprt;
app.listen(PORT, () => {
  logger.info(`LockMint server running on port ${PORT}`);
});
