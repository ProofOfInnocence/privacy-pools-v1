const { poseidonHash } = require('./utils')


class TxRecord {
  constructor({ inputs = [], outputs = [], publicAmount = 0, index = 0 }) {
    this.inputs = inputs
    this.outputs = outputs
    this.publicAmount = publicAmount
    this.index = index
  }

  hash() {
    return poseidonHash([poseidonHash([this.inputs[0].getNullifier(), this.inputs[1].getNullifier(), this.outputs[0].getCommitment(), this.outputs[1].getCommitment()]), this.publicAmount, this.index])
  }
}


module.exports = TxRecord
