const path = require('path');
const fs = require('fs');
const solc = require('solc');

const contractsDirectory = path.resolve(__dirname, 'contracts');
const contractFiles = ['LockUnlock.sol', 'MintBurn.sol'];

const input = {};
contractFiles.forEach((fileName) => {
  const filePath = path.resolve(contractsDirectory, fileName);
  input[fileName] = {
    content: fs.readFileSync(filePath, 'utf8'),
  };
});

const solcInput = {
  language: 'Solidity',
  sources: input,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    evmVersion: 'byzantium',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

let output;
try {
  const solcVersion = 'v0.5.16+commit.9c3226ce';
  solc.loadRemoteVersion(solcVersion, (err, solcSnapshot) => {
    if (err) {
      console.error(`Error loading solc version ${solcVersion}:`, err);
      throw err;
    }

    output = JSON.parse(solcSnapshot.compile(JSON.stringify(solcInput), findImports));

    if (output.errors) {
      output.errors.forEach((err) => {
        console.error(err.formattedMessage);
      });
      throw new Error('Compilation failed with errors');
    }

    const buildPath = path.resolve(__dirname, 'build');
    if (!fs.existsSync(buildPath)) {
      fs.mkdirSync(buildPath);
    }

    for (let contractFileName in output.contracts) {
      const contracts = output.contracts[contractFileName];
      for (let contractName in contracts) {
        const contract = contracts[contractName];

        const abiPath = path.resolve(buildPath, `${contractName}.abi.json`);
        fs.writeFileSync(abiPath, JSON.stringify(contract.abi, null, 2));

        const bytecodePath = path.resolve(buildPath, `${contractName}.bytecode`);
        fs.writeFileSync(bytecodePath, contract.evm.bytecode.object);
      }
    }

    console.log('Contracts compiled successfully. Output saved in the build directory.');
  });
} catch (err) {
  console.error('Compilation error:', err);
}

function findImports(importPath) {
  try {
    let importFullPath = path.resolve(contractsDirectory, importPath);
    if (fs.existsSync(importFullPath)) {
      return { contents: fs.readFileSync(importFullPath, 'utf8') };
    }

    importFullPath = path.resolve(__dirname, 'node_modules', importPath);
    if (fs.existsSync(importFullPath)) {
      return { contents: fs.readFileSync(importFullPath, 'utf8') };
    }

    return { error: `Could not find import: ${importPath}` };
  } catch (error) {
    return { error: `Error while trying to find import: ${importPath}, ${error}` };
  }
}
