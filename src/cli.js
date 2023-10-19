const Utxo = require('./utxo')
const { BigNumber } = ethers
const { transaction } = require('./index')
const { toFixedHex, FIELD_SIZE } = require('./utils')
const { proveInclusion } = require('./poi')

const TxRecord = require('./txRecord')
const { getNullifierEvents, getCommitmentEvents, getTxRecordEvents } = require('./events.js')

const DEFAULT_ZERO = '21663839004416932945382355908790599225266501822907911457504978515578255421292'

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

async function transact({ provider, tornadoPool, keypair, amount, recipient = 0, allowlist = null }) {
  let inputs = await getUtxos({ provider, tornadoPool, keypair })
  if (inputs.length > 2) {
    throw new Error('Too many utxos, contact support')
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
  while (inputs.length < 2) {
    const newBlinding = BigNumber.from(
      '0x' +
        ethers.utils
          .keccak256(ethers.utils.concat([BigNumber.from(DEFAULT_ZERO), outputs[inputs.length].blinding]))
          .slice(2, 64),
    ).mod(FIELD_SIZE)
    // console.log('Output blinding:', outputs[inputs.length].blinding)
    // console.log('New blinding:', newBlinding)
    inputs.push(new Utxo({ amount: BigNumber.from(0), keypair, blinding: newBlinding }))
  }
  if (allowlist) {
    let publicAmount = outputs
      .reduce((sum, x) => sum.add(x.amount), BigNumber.from(0))
      .sub(inputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0)))
      .add(FIELD_SIZE)
      .mod(FIELD_SIZE)
      .toString()

    const withdrawTxRecord = new TxRecord({
      inputs,
      outputs,
      publicAmount,
      index: 0,
    })
    const proof = await proveInclusion({ provider, tornadoPool, keypair, finalTxRecord: withdrawTxRecord })
    console.log('Withdrawing with proof', proof)
  }
  return await transaction({ tornadoPool, inputs, outputs, recipient })
}

async function deposit({ provider, tornadoPool, keypair, amount }) {
  return await transact({ provider, tornadoPool, keypair, amount })
}

async function withdraw({ provider, tornadoPool, keypair, amount, recipient, allowlist = null }) {
  return await transact({ provider, tornadoPool, keypair, amount: amount, recipient, allowlist })
}

module.exports = {
  getUtxos,
  deposit,
  withdraw,
  balance,
}
