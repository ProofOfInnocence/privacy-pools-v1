const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers
const { prove } = require('../src/prover')
const { utils: ffjavascript } = require('ffjavascript')

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash, poseidonHash2 } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const MerkleTree = require('fixed-merkle-tree')

const { getUtxos, deposit, withdraw, balance } = require('../src/cli')
const {
  proveInclusion,
  proveInclusionWithTxHash,
  getPoiSteps,
  buildTxRecordMerkleTree,
  getTxRecord,
} = require('../src/poi')
require('../src/txRecord')
const fs = require('fs')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('ProofOfInnocence', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const hasher = await deploy('Hasher')

    const token = await deploy('WETH', 'Wrapped ETH', 'WETH')
    await token.deposit({ value: utils.parseEther('3') })

    /** @type {TornadoPool} */
    const tornadoPool = await deploy(
      'TornadoPool',
      verifier2.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      MAXIMUM_DEPOSIT_AMOUNT,
    )

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, sender }
  }

  it('should generate inputs for the steps of poi', async function () {
    const { tornadoPool } = await loadFixture(fixture)
    const aliceDepositAmount1 = utils.parseEther('0.03')
    const aliceDepositAmount2 = utils.parseEther('0.04')
    const aliceWithdrawAmount1 = utils.parseEther('0.05')
    const aliceDepositAmount3 = utils.parseEther('0.07')
    const aliceWithdrawAmount2 = utils.parseEther('0.06')
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'

    const aliceKeypair = new Keypair() // contains private and public keys

    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount1,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1,
    )
    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount2,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2),
    )
    const result1 = await withdraw({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceWithdrawAmount1,
      recipient: bobEthAddress,
    })

    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2).sub(aliceWithdrawAmount1),
    )

    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount3,
    })

    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2).sub(aliceWithdrawAmount1).add(aliceDepositAmount3),
    )

    const result2 = await withdraw({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceWithdrawAmount2,
      recipient: bobEthAddress,
    })

    let stepInputs = await proveInclusionWithTxHash({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      txHash: result2.transactionHash,
    })
    // const { proof, publicSignals } = await prove(firstStepInput, `./membership-proof/artifacts/circuits/proofOfInnocence`)
    // console.log(proof)
    // console.log(publicSignals)
    const path = './membership-proof/test/inputs.json'
    // console.log(JSON.stringify(, null, 2))
    const inputs = ffjavascript.stringifyBigInts(stepInputs)
    // write inputs to te path
    fs.writeFileSync(path, JSON.stringify(inputs, null, 2))
  })

  it('should generate inputs before withdraw', async function () {
    const { tornadoPool } = await loadFixture(fixture)
    const aliceDepositAmount1 = utils.parseEther('0.03')
    const aliceDepositAmount2 = utils.parseEther('0.04')
    const aliceWithdrawAmount = utils.parseEther('0.05')
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'

    const aliceKeypair = new Keypair() // contains private and public keys

    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount1,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1,
    )
    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount2,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2),
    )
    const result = await withdraw({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceWithdrawAmount,
      recipient: bobEthAddress,
      allowlist: [bobEthAddress],
    })
  })
})
