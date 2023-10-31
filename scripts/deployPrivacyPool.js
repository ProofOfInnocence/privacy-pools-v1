const { ethers } = require('hardhat')
const { utils } = ethers
// const prompt = require('prompt-sync')()

const MERKLE_TREE_HEIGHT = 23
const { MAXIMUM_DEPOSIT_AMOUNT } = process.env

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
  await verifier2.deployed()
  console.log(`verifier2: ${verifier2.address}`)

  const Hasher = await await ethers.getContractFactory('Hasher')
  const hasher = await Hasher.deploy()
  await hasher.deployed()
  console.log(`hasher: ${hasher.address}`)

  const Pool = await ethers.getContractFactory('PrivacyPool')

  console.log('=========> this is what Pool looks like: ', Pool)
  console.log(
    `constructor args:\n${JSON.stringify([
      verifier2.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token,
      utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT),
    ]).slice(1, -1)}\n`,
  )
  /**
   *     IVerifier _verifier2,
    uint32 _levels,
    address _hasher,
    IERC20 _token,
    uint256 _maximumDepositAmount
   */
  const privacyPool = await Pool.deploy(
    verifier2.address,
    MERKLE_TREE_HEIGHT,
    hasher.address,
    token,
    utils.parseEther(MAXIMUM_DEPOSIT_AMOUNT),
  )

  console.log(`Privacy Pool Deployed at: ${privacyPool.address}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
