/* eslint-disable no-console */
const MerkleTree = require('fixed-merkle-tree')
const { ethers } = require('hardhat')
const { BigNumber } = ethers
const { toFixedHex, poseidonHash2, getExtDataHash, FIELD_SIZE } = require('./utils')
const Utxo = require('./utxo')

const { prove } = require('./prover')
const MERKLE_TREE_HEIGHT = 23

async function buildMerkleTree({ tornadoPool }) {
  const filter = tornadoPool.filters.NewCommitment()
  const events = await tornadoPool.queryFilter(filter, 0)

  const leaves = events.sort((a, b) => a.args.index - b.args.index).map((e) => toFixedHex(e.args.commitment))
  return new MerkleTree(MERKLE_TREE_HEIGHT, leaves, { hashFunction: poseidonHash2 })
}

async function getProof({ inputs, outputs, tree, extAmount, fee, recipient, relayer, membershipProofURI }) {
  // inputs = shuffle(inputs)
  // outputs = shuffle(outputs)

  let inputMerklePathIndices = []
  let inputMerklePathElements = []

  for (const input of inputs) {
    if (input.amount > 0) {
      input.index = tree.indexOf(toFixedHex(input.getCommitment()))
      if (input.index < 0) {
        throw new Error(`Input commitment ${toFixedHex(input.getCommitment())} was not found`)
      }
      inputMerklePathIndices.push(input.index)
      inputMerklePathElements.push(tree.path(input.index).pathElements)
    } else {
      inputMerklePathIndices.push(0)
      inputMerklePathElements.push(new Array(tree.levels).fill(0))
    }
  }

  const extData = {
    recipient: toFixedHex(recipient, 20),
    extAmount: toFixedHex(extAmount),
    relayer: toFixedHex(relayer, 20),
    fee: toFixedHex(fee),
    encryptedOutput1: outputs[0].encrypt(),
    // encryptedOutput2: outputs[1].encrypt(),
    membershipProofURI,
  }

  const extDataHash = getExtDataHash(extData)
  let input = {
    root: tree.root(),
    inputNullifier: inputs.map((x) => x.getNullifier()),
    outputCommitment: outputs.map((x) => x.getCommitment()),
    publicAmount: BigNumber.from(extAmount).sub(fee).add(FIELD_SIZE).mod(FIELD_SIZE).toString(),
    extDataHash,

    // data for 2 transaction inputs
    inAmount: inputs.map((x) => x.amount),
    inPrivateKey: inputs.map((x) => x.keypair.privkey),
    inBlinding: inputs.map((x) => x.blinding),
    inPathIndices: inputMerklePathIndices,
    inPathElements: inputMerklePathElements,

    // data for 2 transaction outputs
    outAmount: outputs.map((x) => x.amount),
    outBlinding: outputs.map((x) => x.blinding),
    outPubkey: outputs.map((x) => x.keypair.pubkey),
  }

  const { proof } = await prove(input, `./artifacts/circuits/transaction${inputs.length}`)

  const args = {
    proof,
    root: toFixedHex(input.root),
    inputNullifiers: inputs.map((x) => toFixedHex(x.getNullifier())),
    outputCommitments: outputs.map((x) => toFixedHex(x.getCommitment())),
    publicAmount: toFixedHex(input.publicAmount),
    extDataHash: toFixedHex(extDataHash),
  }

  return {
    extData,
    args,
  }
}

async function prepareTransaction({
  tornadoPool,
  inputs = [],
  outputs = [],
  fee = 0,
  recipient = 0,
  relayer = 0,
  membershipProofURI = '',
}) {
  if (inputs.length > 1 || outputs.length > 1) {
    throw new Error('Incorrect inputs/outputs count')
  }
  while (inputs.length !== 1) {
    inputs.push(new Utxo())
  }
  while (outputs.length < 1) {
    outputs.push(new Utxo())
  }

  let extAmount = BigNumber.from(fee)
    .add(outputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0)))
    .sub(inputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0)))

  const { args, extData } = await getProof({
    inputs,
    outputs,
    tree: await buildMerkleTree({ tornadoPool }),
    extAmount,
    fee,
    recipient,
    relayer,
    membershipProofURI,
  })

  return {
    args,
    extData,
  }
}

async function transaction({ tornadoPool, ...rest }) {
  const { args, extData } = await prepareTransaction({
    tornadoPool,
    ...rest,
  })

  const receipt = await tornadoPool.transact(args, extData, {
    gasLimit: 2e6,
  })
  return await receipt.wait()
}

async function registerAndTransact({ tornadoPool, account, ...rest }) {
  const { args, extData } = await prepareTransaction({
    tornadoPool,
    ...rest,
  })

  const receipt = await tornadoPool.registerAndTransact(account, args, extData, {
    gasLimit: 4e6,
  })
  await receipt.wait()
}

module.exports = { transaction, registerAndTransact, prepareTransaction, buildMerkleTree, MERKLE_TREE_HEIGHT }
