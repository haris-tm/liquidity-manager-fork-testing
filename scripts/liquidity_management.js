const { ethers } = require("hardhat");

// Import ABIs
const IERC20_ABI = require("@openzeppelin/contracts/build/contracts/IERC20.json").abi;
const INonfungiblePositionManager_ABI = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json").abi;

// Contract Addresses
const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // Uniswap V3 Position Manager on Arbitrum
const token0Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const token1Address = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";
const ownerAddress = "0xabC50f245D6c937Ec6152E6Ffcb113faf43315Ad";
const richAddressToken0 = "0x450bb6774Dd8a756274E0ab4107953259d2ac541"; // Address with token0 balance
const richAddressToken1 = "0x25681Ab599B4E2CEea31F8B498052c53FC2D74db"; // Address with token1 balance
const routerV3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 router address
const tokenId = 78970;

// MaxUint128 for collecting all tokens owed
const MaxUint128 = BigInt("340282366920938463463374607431768211455"); // 2^128 - 1

async function main() {
  const provider = ethers.provider;

  // Contract Instances
  const token0 = new ethers.Contract(token0Address, IERC20_ABI, provider);
  const token1 = new ethers.Contract(token1Address, IERC20_ABI, provider);
  const positionManager = new ethers.Contract(positionManagerAddress, INonfungiblePositionManager_ABI, provider);

  // Step 1: Check initial balances of token0 and token1 for the rich addresses
  const token0Balance = await token0.balanceOf(richAddressToken0);
  const token1Balance = await token1.balanceOf(richAddressToken1);

  console.log(`Initial balance for token0 (rich address): ${ethers.formatUnits(token0Balance, 18)}`);
  console.log(`Initial balance for token1 (rich address): ${ethers.formatUnits(token1Balance, 6)}`);

  // Amount to transfer for liquidity provisioning
  const amountToTransfer = ethers.parseUnits("10", 18);

  // Impersonate rich addresses and transfer tokens to the owner
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [richAddressToken0] });
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [richAddressToken1] });

  const richSignerToken0 = await ethers.getSigner(richAddressToken0);
  const richSignerToken1 = await ethers.getSigner(richAddressToken1);

  await ethers.provider.send("hardhat_setBalance", [richAddressToken0, "0x8AC7230489E80000"]);
  await ethers.provider.send("hardhat_setBalance", [richAddressToken1, "0x8AC7230489E80000"]);

  // Transfer tokens to owner
  await token0.connect(richSignerToken0).transfer(ownerAddress, amountToTransfer); // 10 WETH
  await token1.connect(richSignerToken1).transfer(ownerAddress, ethers.parseUnits("10", 6)); // 10 USDC.e
  console.log(`Transferred tokens to ownerAddress: ${ethers.formatUnits(amountToTransfer, 18)} of token0, and 10 of token1`);

  // Confirm the transfer by checking balances on the owner address
  const ownerBalance0 = await token0.balanceOf(ownerAddress);
  const ownerBalance1 = await token1.balanceOf(ownerAddress);
  console.log(`Owner balance - token0: ${ethers.formatUnits(ownerBalance0, 18)}, token1: ${ethers.formatUnits(ownerBalance1, 6)}`);

  // Stop impersonation for rich addresses
  await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [richAddressToken0] });
  await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [richAddressToken1] });

  // Fund owner address with ETH for transaction fees
  await ethers.provider.send("hardhat_setBalance", [ownerAddress, "0x8AC7230489E80000"]);

  // Impersonate the owner address for subsequent transactions
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [ownerAddress] });
  const ownerSigner = await ethers.getSigner(ownerAddress);

  // Approve tokens for the Uniswap Router
  await token0.connect(ownerSigner).approve(routerV3, amountToTransfer);
  await token1.connect(ownerSigner).approve(routerV3, amountToTransfer);
  console.log(`Approved tokens for Uniswap V3 Router: ${ethers.formatUnits(amountToTransfer, 18)} of token0 and token1`);

  // Increase Liquidity for the Position
  const increaseParams = {
    tokenId: tokenId,
    amount0Desired: ethers.parseUnits("10", 18),
    amount1Desired: ethers.parseUnits("10", 6),
    amount0Min: 0,
    amount1Min: 0,
    deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes from now
  };

  const increaseLiquidityTx = await positionManager.connect(ownerSigner).increaseLiquidity(increaseParams);
  await increaseLiquidityTx.wait();
  console.log("Liquidity successfully increased for tokenId:", tokenId);

  // Retrieve updated position information
  const updatedPosition = await positionManager.positions(tokenId);
  console.log("Updated position details:", updatedPosition);

  // Decrease Liquidity (remove half)
  const halfLiquidity = updatedPosition.liquidity / BigInt(2);
  const decreaseParams = {
    tokenId: tokenId,
    liquidity: halfLiquidity,
    amount0Min: 0,
    amount1Min: 0,
    deadline: Math.floor(Date.now() / 1000) + 1200,
  };

  const decreaseLiquidityTx = await positionManager.connect(ownerSigner).decreaseLiquidity(decreaseParams);
  await decreaseLiquidityTx.wait();
  console.log("Liquidity decreased by half for tokenId:", tokenId);

  let currentLiquidity = (await positionManager.positions(tokenId)).liquidity;
    const decreaseParams2 = {
      tokenId: tokenId,
      liquidity: currentLiquidity, // Remove all current liquidity
      amount0Min: 0,
      amount1Min: 0,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    };

    const decreaseLiquidityTx2 = await positionManager.connect(ownerSigner).decreaseLiquidity(decreaseParams2);
    await decreaseLiquidityTx2.wait();
    console.log(`Liquidity decreased for tokenId: ${tokenId}`);

  // Collect Tokens (accrued fees or uncollected amounts)
  const collectParams = {
    tokenId: tokenId,
    recipient: ownerAddress,
    amount0Max: MaxUint128,
    amount1Max: MaxUint128,
  };

  const collectTx = await positionManager.connect(ownerSigner).collect(collectParams);
  await collectTx.wait();
  console.log("Tokens collected for tokenId:", tokenId);

  // Verify if liquidity has reached zero
  const finalPosition = await positionManager.positions(tokenId);
  const isLiquidityZero = finalPosition.liquidity === BigInt(0);
  console.log(`Final position details after all operations:`, finalPosition);
  console.log(`Is liquidity zero? ${isLiquidityZero ? "Yes" : "No"}`);

  // Stop impersonating the owner address
  await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ownerAddress] });
}

main().catch((error) => {
  console.error("Error executing script:", error);
  process.exit(1);
});
