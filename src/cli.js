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

module.exports = { getUtxos, deposit, withdraw, balance, getNullifierEvents, getCommitmentEvents, getTxRecordEvents }
