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
  const network = await ethers.provider.getNetwork()

  const chainId = network.chainId

  console.log('deploying to chainId:', network.name)
  if (chainId !== 5) {
    console.log('Please switch to goerli network')
    return
  }


  const Verifier2 = await ethers.getContractFactory('Verifier2')
  const verifier2 = await Verifier2.deploy()
  await verifier2.deployed()
  console.log(`verifier2 deployed at: ${verifier2.address}`)

  const Hasher = await await ethers.getContractFactory('Hasher')
  const hasher = await Hasher.deploy()
  await hasher.deployed()
  console.log(`hasher deployed at: ${hasher.address}`)

  const Pool = await ethers.getContractFactory('ETHPrivacyPool')
  const constructorArgs = [
    verifier2.address,
    MERKLE_TREE_HEIGHT,
    hasher.address,
    utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT).toHexString(),
  ]

  console.log(`constructor args:\n${JSON.stringify(constructorArgs).slice(1, -1)}\n`)
  fs.writeFileSync('arguments.js', `module.exports = [${JSON.stringify(constructorArgs).slice(1, -1)}]`)

  const privacyPool = await Pool.deploy(...constructorArgs)

  console.log(`Privacy Pool Deployed at: ${privacyPool.address}`)
  // npx hardhat verify --constructor-args arguments.js DEPLOYED_CONTRACT_ADDRESS

  console.log('To verify the contract on etherscan run:')
  console.log(
    `npx hardhat verify --constructor-args arguments.js ${privacyPool.address} --network ${network.name}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
