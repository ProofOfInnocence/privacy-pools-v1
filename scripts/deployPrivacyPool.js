const { ethers } = require('hardhat')
// import fs for writing to a file
const fs = require('fs')
const { utils } = ethers
// const prompt = require('prompt-sync')()

const MERKLE_TREE_HEIGHT = 23
const { MAXIMUM_DEPOSIT_AMOUNT } = process.env
// const fs = require('fs')

async function main() {
  require('./compileHasher')

  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId)
  console.log('chainId: ', chainId)
  if (chainId !== 5) {
    console.log('Please switch to goerli network')
    return
  }

  const token = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' // WETH on goerli

  const Verifier2 = await ethers.getContractFactory('Verifier2')
  const verifier2 = await Verifier2.deploy()
  console.log('verifier2: ', verifier2)
  await verifier2.deployed()
  console.log(`verifier2: ${verifier2.address}`)

  const Hasher = await await ethers.getContractFactory('Hasher')
  const hasher = await Hasher.deploy()
  await hasher.deployed()
  console.log(`hasher: ${hasher.address}`)

  const Pool = await ethers.getContractFactory('PrivacyPool')

  // console.log('=========> this is what Pool looks like: ', Pool)
  console.log(
    `constructor args:\n${JSON.stringify([
      verifier2.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token,
      utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT),
    ]).slice(1, -1)}\n`,
  )
  // save constructor args to a file arguments.js  as module.exports = [

  // fs.writeFileSync(
  //   'arguments.js',
  //   `module.exports = [${JSON.stringify([
  //     verifier2.address,
  //     MERKLE_TREE_HEIGHT,
  //     hasher.address,
  //     token,
  //     utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT),
  //   ]).slice(1, -1)}]`,
  // )

  const privacyPool = await Pool.deploy(
    verifier2.address,
    MERKLE_TREE_HEIGHT,
    hasher.address,
    token,
    utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT),
  )

  console.log(`Privacy Pool Deployed at: ${privacyPool.address}`)
  // npx hardhat verify --constructor-args arguments.js DEPLOYED_CONTRACT_ADDRESS

  console.log('To verify the contract on etherscan run:')
  console.log(
    `npx hardhat verify --constructor-args arguments.js ${privacyPool.address}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
