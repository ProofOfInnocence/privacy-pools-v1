const { ethers } = require('hardhat')
const { utils } = ethers
// const prompt = require('prompt-sync')()

const MERKLE_TREE_HEIGHT = 23
const { MAXIMUM_DEPOSIT_AMOUNT } = process.env

async function main() {
  require('./compileHasher')
  const token = '0xCa8d20f3e0144a72C6B5d576e9Bd3Fd8557E2B04' // WBNB

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
      l1ChainId,
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
    MAXIMUM_DEPOSIT_AMOUNT
  )


}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
