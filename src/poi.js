const Utxo = require('./utxo')
const { toFixedHex, poseidonHash2, FIELD_SIZE } = require('./utils')
const TxRecord = require('./txRecord')
const MerkleTree = require('fixed-merkle-tree')
const { BigNumber } = ethers

const MERKLE_TREE_HEIGHT = 23
const ZERO_VALUE = BigInt(21663839004416932945382355908790599225266501822907911457504978515578255421292)
const DEFAULT_ZERO = '21663839004416932945382355908790599225266501822907911457504978515578255421292'

const { getNullifierEvents, getCommitmentEvents, getTxRecordEvents } = require('./events.js')

async function getTxRecord({ provider, tornadoPool, txHash }) {
  const receipt = await provider.getTransactionReceipt(txHash)
  const NewTxRecordTopic = tornadoPool.filters.NewTxRecord().topics[0]
  const event = receipt.logs.find((log) => log.topics[0] === NewTxRecordTopic)
  const txRecord = tornadoPool.interface.parseLog(event)
  return txRecord
}

async function getMappings({ provider, tornadoPool, keypair }) {
  const commitmentEvents = await getCommitmentEvents({ provider, tornadoPool })
  const commitmentToUtxo = new Map()
  const nullifierToUtxo = new Map()
  for (const event of commitmentEvents) {
    let decryptedUtxo = null
    try {
      decryptedUtxo = Utxo.decrypt(keypair, event.args.encryptedOutput, event.args.index)
    } catch (e) {
      continue
    }
    const currentNullifier = toFixedHex(decryptedUtxo.getNullifier())
    nullifierToUtxo.set(currentNullifier, decryptedUtxo)
    commitmentToUtxo.set(toFixedHex(event.args.commitment), decryptedUtxo)
  }

  const txRecordEvents = await getTxRecordEvents({ provider, tornadoPool })
  for (const event of txRecordEvents) {
    function findBlindingForNullifier(trivialNullifier, commitment) {
      trivialNullifier = toFixedHex(trivialNullifier)
      commitment = toFixedHex(commitment)

      if (!commitmentToUtxo.has(commitment)) {
        return
      }
      if (nullifierToUtxo.has(trivialNullifier)) {
        return
      }
      const utxo = commitmentToUtxo.get(commitment)
      const newBlinding = BigNumber.from(
        '0x' +
          ethers.utils
            .keccak256(ethers.utils.concat([BigNumber.from(DEFAULT_ZERO), utxo.blinding]))
            .slice(2, 64),
      ).mod(FIELD_SIZE)

      const newUtxo = new Utxo({ amount: BigInt(0), keypair, blinding: newBlinding, index: 0 })
      nullifierToUtxo.set(toFixedHex(newUtxo.getNullifier()), newUtxo)
      if (toFixedHex(newUtxo.getNullifier()) != trivialNullifier) {
        throw new Error('Should not happen')
      }
    }
    findBlindingForNullifier(event.args.inputNullifier1, event.args.outputCommitment1)
    findBlindingForNullifier(event.args.inputNullifier2, event.args.outputCommitment2)
  }

  // const nullifierEvents = await getNullifierEvents({ provider, tornadoPool })
  // const nullifierToUtxo = new Map()
  // for (const event of nullifierEvents) {
  //   let decryptedUtxo = null
  //   try {
  //     decryptedUtxo = Utxo.decrypt(keypair, event.args.encryptedInput, 0)
  //   } catch (e) {
  //     continue
  //   }
  //   nullifierToUtxo.set(toFixedHex(event.args.nullifier), decryptedUtxo)
  // }

  return { nullifierToUtxo, commitmentToUtxo }
}

async function getPoiSteps({
  provider,
  tornadoPool,
  keypair,
  nullifierToUtxo,
  commitmentToUtxo,
  finalTxRecord,
}) {
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

  txRecords = txRecords.filter((x) => (x.index < finalTxRecord.index ? finalTxRecord.index : x.index + 1))
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
  // for (let i = 0; i < steps.length; i++) {
  //   console.log('Step', i)
  //   console.log('Inputs:', steps[i].inputs)
  //   console.log('Outputs:', steps[i].outputs)
  //   console.log('_______________')
  // }
  const txRecordsMerkleTree = buildTxRecordMerkleTree({ events: txRecordEvents })
  const allowedTxRecordsMerkleTree = buildTxRecordMerkleTree({ events: txRecordEvents })
  let accInnocentCommitments = [ZERO_VALUE, ZERO_VALUE]
  let inputs = []
  for (let i = 0; i < steps.length; i++) {
    // console.log('Step', i)
    const { stepInputs, outputInnocentCommitments } = steps[i].generateInputs({
      txRecordsMerkleTree,
      allowedTxRecordsMerkleTree: allowedTxRecordsMerkleTree,
      accInnocentCommitments,
      isLastStep: i == steps.length - 1,
    })
    accInnocentCommitments = outputInnocentCommitments
    inputs.push(stepInputs)
    // console.log('Inputs:', stepInputs)
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
