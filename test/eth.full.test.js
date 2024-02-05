const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')

const { getUtxos, deposit, withdraw, balance } = require('../src/cli')

const MERKLE_TREE_HEIGHT = 23
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('ETH Privacy Pool', function () {
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

    const tornadoPool = await deploy(
      'ETHPrivacyPool',
      verifier2.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      MAXIMUM_DEPOSIT_AMOUNT,
    )

    return { tornadoPool, sender }
  }

  it('encrypt -> decrypt should work', () => {
    const data = Buffer.from([0xff, 0xaa, 0x00, 0x01])
    const keypair = new Keypair()

    const ciphertext = keypair.encrypt(data)
    const result = keypair.decrypt(ciphertext)
    expect(result).to.be.deep.equal(data)
  })

  it('constants check', async () => {
    const { tornadoPool } = await loadFixture(fixture)
    const maxFee = await tornadoPool.MAX_FEE()
    const maxExtAmount = await tornadoPool.MAX_EXT_AMOUNT()
    const fieldSize = await tornadoPool.FIELD_SIZE()

    expect(maxExtAmount.add(maxFee)).to.be.lt(fieldSize)
  })

  it('should deposit, transact and withdraw', async function () {
    const { tornadoPool } = await loadFixture(fixture)

    // Alice deposits into tornado pool
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount })
    await transaction({ tornadoPool, outputs: [aliceDepositUtxo], msgValue: aliceDepositAmount })

    // Bob gives Alice address to send some eth inside the shielded pool
    const bobKeypair = new Keypair() // contains private and public keys
    const bobAddress = bobKeypair.address() // contains only public key

    // Alice sends some funds to Bob
    const bobSendAmount = utils.parseEther('0.06')
    const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) })
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(bobSendAmount),
      keypair: aliceDepositUtxo.keypair,
    })
    await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [bobSendUtxo, aliceChangeUtxo] })

    // Bob parses chain to detect incoming funds
    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)
    let bobReceiveUtxo
    try {
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
    }
    expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount)

    // Bob withdraws a part of his funds from the shielded pool
    const bobWithdrawAmount = utils.parseEther('0.05')
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const bobChangeUtxo = new Utxo({ amount: bobSendAmount.sub(bobWithdrawAmount), keypair: bobKeypair })
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      outputs: [bobChangeUtxo],
      recipient: bobEthAddress,
    })

    const bobBalance = await ethers.provider.getBalance(bobEthAddress)
    expect(bobBalance).to.be.equal(bobWithdrawAmount)
  })

  xit('should be compliant', async function () {
    // basically verifier should check if a commitment and a nullifier hash are on chain
    const { tornadoPool } = await loadFixture(fixture)
    const aliceDepositAmount = utils.parseEther('0.07')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount })
    const [sender] = await ethers.getSigners()

    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })
    const receipt = await tornadoPool.transact(args, extData, {
      gasLimit: 2e6,
      value: aliceDepositAmount,
    })
    await receipt.wait()

    // withdrawal
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [],
      recipient: sender.address,
    })

    const tree = await buildMerkleTree({ tornadoPool })
    const commitment = aliceDepositUtxo.getCommitment()
    const index = tree.indexOf(toFixedHex(commitment)) // it's the same as merklePath and merklePathIndexes and index in the tree
    aliceDepositUtxo.index = index
    const nullifier = aliceDepositUtxo.getNullifier()

    // commitment = hash(amount, pubKey, blinding)
    // nullifier = hash(commitment, merklePath, sign(merklePath, privKey))
    const dataForVerifier = {
      commitment: {
        amount: aliceDepositUtxo.amount,
        pubkey: aliceDepositUtxo.keypair.pubkey,
        blinding: aliceDepositUtxo.blinding,
      },
      nullifier: {
        commitment,
        merklePath: index,
        signature: aliceDepositUtxo.keypair.sign(commitment, index),
      },
    }

    // generateReport(dataForVerifier) -> compliance report
    // on the verifier side we compute commitment and nullifier and then check them onchain
    const commitmentV = poseidonHash([...Object.values(dataForVerifier.commitment)])
    const nullifierV = poseidonHash([
      commitmentV,
      dataForVerifier.nullifier.merklePath,
      dataForVerifier.nullifier.signature,
    ])

    expect(commitmentV).to.be.equal(commitment)
    expect(nullifierV).to.be.equal(nullifier)
    expect(await tornadoPool.nullifierHashes(nullifierV)).to.be.equal(true)
    // expect commitmentV present onchain (it will be in NewCommitment events)

    // in report we can see the tx with NewCommitment event (this is how alice got money)
    // and the tx with NewNullifier event is where alice spent the UTXO
  })

  it('should revert if msg.value is not equal to deposit amount', async function () {
    const { tornadoPool } = await loadFixture(fixture)
    const aliceDepositAmount = utils.parseEther('0.01')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount })

    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })

    await expect(
      tornadoPool.transact(args, extData, {
        gasLimit: 2e6,
        value: aliceDepositAmount.sub(1),
      }),
    ).to.be.revertedWith('Invalid amount')
  })

  it('should deposit with single keypair', async function () {
    const { tornadoPool } = await loadFixture(fixture)
    const aliceDepositAmount = utils.parseEther('0.07')

    const aliceKeypair = new Keypair() // contains private and public keys

    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount,
      msgValue: aliceDepositAmount,
    })

    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)
    const aliceReceiveUtxo1 = Utxo.decrypt(aliceKeypair, events[0].args.encryptedOutput, events[0].args.index)
    const aliceReceiveUtxo2 = Utxo.decrypt(aliceKeypair, events[1].args.encryptedOutput, events[1].args.index)
    expect(aliceReceiveUtxo1.amount.add(aliceReceiveUtxo2.amount)).to.be.equal(aliceDepositAmount)
    const aliceUtxos = await getUtxos({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })
    expect(aliceUtxos.length).to.be.equal(1)
    expect(aliceUtxos[0].amount).to.be.equal(aliceDepositAmount)
  })

  it('should deposit and withdraw with single keypair', async function () {
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
      msgValue: aliceDepositAmount1,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1,
    )
    await deposit({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceDepositAmount2,
      msgValue: aliceDepositAmount2,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2),
    )
    await withdraw({
      provider: ethers.provider,
      tornadoPool,
      keypair: aliceKeypair,
      amount: aliceWithdrawAmount,
      recipient: bobEthAddress,
    })
    expect(await balance({ provider: ethers.provider, tornadoPool, keypair: aliceKeypair })).to.be.equal(
      aliceDepositAmount1.add(aliceDepositAmount2).sub(aliceWithdrawAmount),
    )
  })
})
