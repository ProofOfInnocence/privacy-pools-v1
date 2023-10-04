const Utxo = require('./utxo')
const { toFixedHex, poseidonHash2 } = require('./utils')
const TxRecord = require('./txRecord')
const MerkleTree = require('fixed-merkle-tree')

const MERKLE_TREE_HEIGHT = 5
const { getNullifierEvents, getCommitmentEvents, getTxRecordEvents } = require('./events.js')

async function getTxRecord({ provider, tornadoPool, txHash }) {
  const receipt = await provider.getTransactionReceipt(txHash)
  const NewTxRecordTopic = tornadoPool.filters.NewTxRecord().topics[0]
  const event = receipt.logs.find((log) => log.topics[0] === NewTxRecordTopic)
  const txRecord = tornadoPool.interface.parseLog(event)
  return txRecord
}

async function getMappings({ provider, tornadoPool, keypair }) {
  const nullifierEvents = await getNullifierEvents({ provider, tornadoPool })
  const nullifierToUtxo = new Map()
  for (const event of nullifierEvents) {
    let decryptedUtxo = null
    try {
      decryptedUtxo = Utxo.decrypt(keypair, event.args.encryptedInput, 0)
    } catch (e) {
      continue
    }
    nullifierToUtxo.set(toFixedHex(event.args.nullifier), decryptedUtxo)
  }

  const commitmentEvents = await getCommitmentEvents({ provider, tornadoPool })
  const commitmentToUtxo = new Map()
  for (const event of commitmentEvents) {
    let decryptedUtxo = null
    try {
      decryptedUtxo = Utxo.decrypt(keypair, event.args.encryptedOutput, event.args.index)
    } catch (e) {
      continue
    }
    const currentNullifier = toFixedHex(decryptedUtxo.getNullifier())
    if (nullifierToUtxo.has(currentNullifier)) {
      nullifierToUtxo.set(currentNullifier, decryptedUtxo)
    }
    commitmentToUtxo.set(toFixedHex(event.args.commitment), decryptedUtxo)
  }
  return { nullifierToUtxo, commitmentToUtxo }
}

async function getPoiSteps({ provider, tornadoPool, keypair, nullifierToUtxo, commitmentToUtxo, finalTxRecord }) {
  const txRecordEvents = await getTxRecordEvents({ provider, tornadoPool })
  let txRecords = []
  for (const event of txRecordEvents) {
    if (!commitmentToUtxo.has(toFixedHex(event.args.outputCommitment1))) {
      continue
    }
    if (!commitmentToUtxo.has(toFixedHex(event.args.outputCommitment2))) {
      throw new Error('Should not happen')
    }
    if (!nullifierToUtxo.has(toFixedHex(event.args.inputNullifier1))) {
      throw new Error('Should not happen')
    }
    if (!nullifierToUtxo.has(toFixedHex(event.args.inputNullifier2))) {
      throw new Error('Should not happen')
    }
    const _txRecord = new TxRecord({
      inputs: [
        nullifierToUtxo.get(toFixedHex(event.args.inputNullifier1)),
        nullifierToUtxo.get(toFixedHex(event.args.inputNullifier2)),
      ],
      outputs: [
        commitmentToUtxo.get(toFixedHex(event.args.outputCommitment1)),
        commitmentToUtxo.get(toFixedHex(event.args.outputCommitment2)),
      ],
      publicAmount: event.args.publicAmount,
      index: event.args.index,
    })
    txRecords.push(_txRecord)
  }

  let steps = [finalTxRecord]
  const todoProve = new Set()
  if (finalTxRecord.inputs[0].amount > 0) {
    todoProve.add(toFixedHex(finalTxRecord.inputs[0].getCommitment()))
  }
  if (finalTxRecord.inputs[1].amount > 0) {
    todoProve.add(toFixedHex(finalTxRecord.inputs[1].getCommitment()))
  }

  txRecords = txRecords.filter((x) => x.index < finalTxRecord.index ? finalTxRecord.index: x.index + 1)
  txRecords.sort((a, b) => b.index - a.index)

  for (const txRecord of txRecords) {
    if (
      (txRecord.outputs[0].amount > 0 && todoProve.has(toFixedHex(txRecord.outputs[0].getCommitment()))) ||
      (txRecord.outputs[1].amount > 0 && todoProve.has(toFixedHex(txRecord.outputs[1].getCommitment())))
    ) {
      todoProve.delete(toFixedHex(txRecord.outputs[0].getCommitment()))
      todoProve.delete(toFixedHex(txRecord.outputs[1].getCommitment()))

      if (txRecord.inputs[0].amount > 0) {
        todoProve.add(toFixedHex(txRecord.inputs[0].getCommitment()))
      }
      if (txRecord.inputs[1].amount > 0) {
        todoProve.add(toFixedHex(txRecord.inputs[1].getCommitment()))
      }
      steps.push(txRecord)
    }
  }

  if (todoProve.size > 0) {
    throw new Error('Not enough proofs')
  }
  // console.log('txRecords to prove: ', txRecordEvents)
  return { steps: steps.reverse(), txRecordEvents }
}

function buildTxRecordMerkleTree({ events }) {
  const leaves = events
    .sort((a, b) => a.args.index - b.args.index)
    .map((e) => toFixedHex(TxRecord.hashFromEvent(e)))
  // console.log('leaves: ', leaves)
  return new MerkleTree(MERKLE_TREE_HEIGHT, leaves, { hashFunction: poseidonHash2 })
}

async function proveInclusionWithTxHash({ provider, tornadoPool, keypair, allowlist, txHash }) {
  const event = await getTxRecord({ provider, tornadoPool, txHash })
  const { nullifierToUtxo, commitmentToUtxo } = await getMappings({ provider, tornadoPool, keypair })

  const finalTxRecord = new TxRecord({
    inputs: [
      nullifierToUtxo.get(toFixedHex(event.args.inputNullifier1)),
      nullifierToUtxo.get(toFixedHex(event.args.inputNullifier2)),
    ],
    outputs: [
      commitmentToUtxo.get(toFixedHex(event.args.outputCommitment1)),
      commitmentToUtxo.get(toFixedHex(event.args.outputCommitment2)),
    ],
    publicAmount: event.args.publicAmount,
    index: event.args.index,
  })

  return await proveInclusion({
    provider,
    tornadoPool,
    keypair,
    allowlist,
    finalTxRecord,
    nullifierToUtxo,
    commitmentToUtxo,
  })
}

async function proveInclusion({
  provider,
  tornadoPool,
  keypair,
  allowlist,
  finalTxRecord,
  nullifierToUtxo = null,
  commitmentToUtxo = null,
}) {
  if (!nullifierToUtxo || !commitmentToUtxo) {
    const { nullifierToUtxo: nullifierToUtxo_, commitmentToUtxo: commitmentToUtxo_ } = await getMappings({
      provider,
      tornadoPool,
      keypair,
    })
    nullifierToUtxo = nullifierToUtxo_
    commitmentToUtxo = commitmentToUtxo_
  }
  const { steps, txRecordEvents } = await getPoiSteps({
    provider,
    tornadoPool,
    keypair,
    nullifierToUtxo,
    commitmentToUtxo,
    finalTxRecord,
  })
  const txRecordsMerkleTree = buildTxRecordMerkleTree({ events: txRecordEvents })
  const allowedTxRecordsMerkleTree = buildTxRecordMerkleTree({ events: txRecordEvents })
  let accInnocentCommitmentsMerkleTree = new MerkleTree(MERKLE_TREE_HEIGHT, [], {
    hashFunction: poseidonHash2,
  })
  let inputs = []
  for (let i = 0; i < steps.length; i++) {
    const stepInputs = steps[i].generateInputs({
      txRecordsMerkleTree,
      allowedTxRecordsMerkleTree: allowedTxRecordsMerkleTree,
      accInnocentCommitmentsMerkleTree: accInnocentCommitmentsMerkleTree,
      isLastStep: i == steps.length - 1,
    })
    inputs.push(stepInputs)
  }
  return inputs
}

module.exports = {
  proveInclusion,
  proveInclusionWithTxHash,
  getPoiSteps,
  buildTxRecordMerkleTree,
  getTxRecord,
}
