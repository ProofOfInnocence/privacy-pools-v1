const Utxo = require('./utxo')
const { BigNumber } = ethers
const { transaction } = require('../src/index')

async function getUtxos({ ethers, tornadoPool, keypair }) {
  const fromBlock = await ethers.provider.getBlock()

  const nullifierFilter = tornadoPool.filters.NewNullifier()
  const nullifierEvents = await tornadoPool.queryFilter(nullifierFilter, fromBlock.number)

  const nullifiers = new Set(nullifierEvents.map((e) => e.args.nullifier))

  // Bob parses chain to detect incoming funds
  const filter = tornadoPool.filters.NewCommitment()

  const events = await tornadoPool.queryFilter(filter, fromBlock.number)
  let utxos = []
  for (const event of events) {
    let utxo = null
    try {
      utxo = Utxo.decrypt(keypair, event.args.encryptedOutput, event.args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      //   bobReceiveUtxo = Utxo.decrypt(keypair, event.args.encryptedOutput, event.args.index)
    }
    if (utxo && utxo.amount > 0 && !nullifiers.has(utxo.getNullifier())) {
      utxos.push(utxo)
    }
  }
  return utxos
}

async function balance({ ethers, tornadoPool, keypair }) {
  const utxos = await getUtxos({ ethers, tornadoPool, keypair })
  return utxos.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0))
}

async function transact({ tornadoPool, keypair, amount, recipient = 0 }) {
  let inputs = await getUtxos({ ethers, tornadoPool, keypair })
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
  await transaction({ tornadoPool, inputs, outputs, recipient })
}

async function deposit({ tornadoPool, keypair, amount }) {
  await transact({ tornadoPool, keypair, amount })
}

async function withdraw({ tornadoPool, keypair, amount, recipient }) {
  await transact({ tornadoPool, keypair, amount: amount, recipient })
}

module.exports = { getUtxos, deposit, withdraw, balance }
