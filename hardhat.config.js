// require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-toolbox")
require('dotenv').config()

// Replace with your own Alchemy or Infura URL
const ALCHEMY_MAINNET_URL = "https://arb-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY;

module.exports = {
  solidity: "0.8.27",
  networks: {
    hardhat: {
      forking: {
        url: ALCHEMY_MAINNET_URL,
        // blockNumber: 15000000, // Optional: specify a block number for deterministic testing
      },
      chainId: 1337, // Custom chain ID for the Hardhat network
    },
  },
  mocha: {
    timeout: 200000, // Set a timeout for Mocha tests to accommodate forked calls
  },
};
