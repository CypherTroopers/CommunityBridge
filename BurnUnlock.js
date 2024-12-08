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
    new winston.transports.File({ filename: 'burn_unlock.log' })
  ]
});

let connectionAttempts = 0;
const maxRetries = 5;

const connectToMongoDB = async () => {
  if (connectionAttempts >= maxRetries) {
    logger.error('Max retries reached. Could not connect to MongoDB.');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    connectionAttempts += 1;
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
  txHash: String,
  error: String,
  retries: { type: Number, default: 0 },
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
    mintBurnContractAddress: process.env.XDC_MINT_BURN_CONTRACT_ADDRESS
  },
  ETH: {
    chainId: 1,
    provider: createFailoverProvider([process.env.ETH_RPC_URL, process.env.ETH_BACKUP_RPC_URL]),
    mintBurnContractAddress: process.env.ETH_MINT_BURN_CONTRACT_ADDRESS
  },
  BNB: {
    chainId: 56,
    provider: createFailoverProvider([process.env.BNB_RPC_URL, process.env.BNB_BACKUP_RPC_URL]),
    mintBurnContractAddress: process.env.BNB_MINT_BURN_CONTRACT_ADDRESS
  }
};

Object.keys(networks).forEach(network => {
  if (networks[network].lockUnlockContractAddress || networks[network].mintBurnContractAddress) {
    networks[network].signer = new ethers.Wallet(
      process.env.PRIVATE_KEY,
      networks[network].provider.getProvider()
    );
  }
});

const unlockTokensOnCypherium = async (to, amount) => {
  try {
    const lockUnlockContract = new ethers.Contract(
      networks.Cypherium.lockUnlockContractAddress,
      require('.ABIfile'),
      networks.Cypherium.signer
    );
    const gasPrice = await networks.Cypherium.provider.getProvider().getGasPrice();
    return await lockUnlockContract.unlock(to, amount, {
      gasLimit: 500000,
      gasPrice
    });
  } catch (error) {
    logger.error(`Error unlocking tokens for user ${to}:`, error);
    throw error;
  }
};

const app = express();
app.use(helmet());

const corsOptions = {
  origin: 'your domain',
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());


app.post('/api/unlock', async (req, res) => {
  const { network, user, amount, transactionHash } = req.body;

  logger.info('Received unlock request', { network, user, amount, transactionHash });

  if (!['XDC', 'BNB', 'ETH'].includes(network)) {
    logger.error('Unsupported network requested', { network });
    return res.status(400).json({ success: false, error: 'Unsupported network.' });
  }
  if (!ethers.utils.isAddress(user)) {
    logger.error('Invalid user address', { user });
    return res.status(400).json({ success: false, error: 'Invalid user address.' });
  }
  if (!transactionHash || !/^0x([A-Fa-f0-9]{64})$/.test(transactionHash)) {
    logger.error('Invalid transaction hash', { transactionHash });
    return res.status(400).json({ success: false, error: 'Invalid transaction hash.' });
  }
  if (!amount || ethers.BigNumber.from(amount).isZero()) {
    logger.error('Invalid or missing amount', { amount });
    return res.status(400).json({ success: false, error: 'Invalid or missing amount.' });
  }

  let transaction;
  try {
    transaction = await new Transaction({
      user,
      network,
      action: 'burn-unlock',
      amount,
      txHash: transactionHash,
      status: 'pending'
    }).save();

    logger.info(`Transaction saved with ID ${transaction._id} for user: ${user}`);

    const receipt = await networks[network].provider.getProvider().getTransactionReceipt(transactionHash);
    if (!receipt || receipt.status !== 1) {
      throw new Error('Burn transaction not confirmed on the blockchain.');
    }

    const burnEvent = receipt.logs.find(log =>
      log.address.toLowerCase() === networks[network].mintBurnContractAddress.toLowerCase()
    );

    if (!burnEvent) {
      throw new Error('Burn event not found in transaction logs.');
    }

    const amountBurned = ethers.BigNumber.from(burnEvent.data);
    if (!amountBurned.eq(ethers.BigNumber.from(amount))) {
      throw new Error('Mismatch between provided amount and burned amount.');
    }

    const unlockTx = await unlockTokensOnCypherium(user, amountBurned);
    await unlockTx.wait();

    transaction.status = 'success';
    transaction.txHash = unlockTx.hash;
    await transaction.save();

    logger.info('Unlock transaction successful', { txHash: unlockTx.hash });
    res.json({ success: true, txHash: unlockTx.hash });
  } catch (error) {
    logger.error('Error during unlock transaction', { error: error.message });

    if (transaction) {
      transaction.status = 'failed';
      transaction.error = error.message;
      transaction.retries += 1;
      await transaction.save();
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.BURN_UNLOCK_PORT || ;
app.listen(PORT, () => {
  logger.info(`BurnUnlock server running on port ${PORT}`);
});
