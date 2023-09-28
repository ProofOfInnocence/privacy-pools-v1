const Utxo = require('./utxo')
const { BigNumber } = ethers
const { transaction } = require('./index')
const { toFixedHex } = require('./utils')

const TxRecord = require('./txRecord')

async function getNullifierEvents({ provider, tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewNullifier()
  return await tornadoPool.queryFilter(filter, 0)
}

async function getCommitmentEvents({ provider, tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewCommitment()
  return await tornadoPool.queryFilter(filter, 0)
}

async function getTxRecordEvents({ provider, tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewTxRecord()
  return await tornadoPool.queryFilter(filter, 0)
}

async function getUtxos({ provider, tornadoPool, keypair }) {
  const nullifierEvents = await getNullifierEvents({ provider, tornadoPool })
  const nullifiers = new Set(nullifierEvents.map((e) => toFixedHex(e.args.nullifier)))
  const events = await getCommitmentEvents({ provider, tornadoPool })
  let utxos = []
  for (const event of events) {
    let utxo = null
    try {
      utxo = Utxo.decrypt(keypair, event.args.encryptedOutput, event.args.index)
    } catch (e) {
      continue
    }
    if (utxo && utxo.amount > 0 && !nullifiers.has(toFixedHex(utxo.getNullifier()))) {
      utxos.push(utxo)
    }
  }
  return utxos
}

async function balance({ provider, tornadoPool, keypair }) {
  const utxos = await getUtxos({ provider, tornadoPool, keypair })
  return utxos.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0))
}

async function transact({ provider, tornadoPool, keypair, amount, recipient = 0 }) {
  let inputs = await getUtxos({ provider, tornadoPool, keypair })
  if (inputs.length > 2) {
    throw new Error('Too many utxos, contact support')
  }
  while (inputs.length < 2) {
    inputs.push(new Utxo({ amount: BigNumber.from(0), keypair }))
  }
  const inputAmount = inputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0))
  let outputAmount
  if (recipient == 0) {
    outputAmount = BigNumber.from(amount).add(inputAmount)
  } else {
    if (inputAmount.lt(BigNumber.from(amount))) {
      throw new Error('Not enough funds')
    }
    outputAmount = inputAmount.sub(BigNumber.from(amount))
  }
  let outputs = [
    new Utxo({ amount: outputAmount, keypair }),
    new Utxo({ amount: BigNumber.from(0), keypair }),
  ]
  return await transaction({ tornadoPool, inputs, outputs, recipient })
}

async function deposit({ provider, tornadoPool, keypair, amount }) {
  return await transact({ provider, tornadoPool, keypair, amount })
}

async function withdraw({ provider, tornadoPool, keypair, amount, recipient }) {
  return await transact({ provider, tornadoPool, keypair, amount: amount, recipient })
}

async function getTxRecord({ provider, tornadoPool, txHash }) {
  const receipt = await provider.getTransactionReceipt(txHash)
  const NewTxRecordTopic = tornadoPool.filters.NewTxRecord().topics[0]
  const event = receipt.logs.find((log) => log.topics[0] === NewTxRecordTopic)
  const txRecord = tornadoPool.interface.parseLog(event)
  return txRecord
}

async function proveInclusion({ provider, tornadoPool, keypair, txHash }) {
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

  const txRecordEvents = await getTxRecordEvents({ provider, tornadoPool })
  // const txRecordHashToTxRecord = new Map()
  // const outCommitmentToTxRecordHash = new Map()
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
    const txRecord = new TxRecord({
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
    txRecords.push(txRecord)
    // const txRecordHash = toFixedHex(txRecord.hash())
    // txRecordHashToTxRecord.set(toFixedHex(txRecord.hash()), txRecord)
    // outCommitmentToTxRecordHash.set(toFixedHex(event.args.outputCommitment1), txRecordHash)
    // outCommitmentToTxRecordHash.set(toFixedHex(event.args.outputCommitment2), txRecordHash)
  }

  // console.log(txRecordHashToTxRecord)

  const event = await getTxRecord({ provider, tornadoPool, txHash })
  const txRecord = new TxRecord({
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

  console.log(txRecord)

  let steps = [txRecord]
  const todoProve = new Set()
  if (txRecord.inputs[0].amount > 0) {
    todoProve.add(toFixedHex(txRecord.inputs[0].getCommitment()))
  }
  if (txRecord.inputs[1].amount > 0) {
    todoProve.add(toFixedHex(txRecord.inputs[1].getCommitment()))
  }

  txRecords = txRecords.filter((x) => x.index < txRecord.index)
  txRecords.sort((a, b) => b.index - a.index)

  console.log(txRecords)

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

  if(todoProve.size > 0) {
    throw new Error('Not enough proofs')
  }

  console.log(steps)
  console.log(txRecords)
}

module.exports = { getUtxos, deposit, withdraw, balance, proveInclusion }
