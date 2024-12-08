const axios = require('axios');

const nodes = [
  { name: 'Cypherium Main', url: 'ENV' },
  { name: 'Cypherium Backup', url: 'ENV' },
  { name: 'Ethereum Main', url: 'ENV' },
  { name: 'Ethereum Backup', url: 'ENV' },
  { name: 'XDC Main', url: 'ENV' },
  { name: 'XDC Backup', url: 'ENV' },
  { name: 'BNB Main', url: ENV' },
  { name: 'BNB Backup', url: 'ENV },
];

const checkNodes = async () => {
  console.log('Checking node status...\n');

  const results = await Promise.all(
    nodes.map(async (node) => {
      try {
        const response = await axios.post(node.url, {
          jsonrpc: '2.0',
          method: 'web3_clientVersion',
          params: [],
          id: 1,
        }, {
          timeout: 5000, 
        });

        return { name: node.name, url: node.url, status: 'Online', client: response.data.result };
      } catch (error) {
        return { name: node.name, url: node.url, status: 'Offline', error: error.message };
      }
    })
  );

  results.forEach((result) => {
    console.log(`Node: ${result.name}`);
    console.log(`URL: ${result.url}`);
    console.log(`Status: ${result.status}`);
    if (result.status === 'Online') {
      console.log(`Client: ${result.client}`);
    } else {
      console.log(`Error: ${result.error}`);
    }
    console.log('-----------------------------------');
  });
};

checkNodes();
