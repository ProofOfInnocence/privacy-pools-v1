const { poseidonHash } = require('./utils')

class TxRecord {
  constructor({ inputs = [], outputs = [], publicAmount = 0, index = 0 }) {
    this.inputs = inputs
    this.outputs = outputs
    this.publicAmount = publicAmount
    this.index = index
  }

  hash() {
    return poseidonHash([
      poseidonHash([
        this.inputs[0].getNullifier(),
        this.inputs[1].getNullifier(),
        this.outputs[0].getCommitment(),
        this.outputs[1].getCommitment(),
      ]),
      this.publicAmount,
      this.index,
    ])
  }

  static hashFromEvent(event) {
    return poseidonHash([
      poseidonHash([
        event.args.inputNullifier1,
        event.args.inputNullifier2,
        event.args.outputCommitment1,
        event.args.outputCommitment2,
      ]),
      event.args.publicAmount,
      event.args.index,
    ])
  }

  async generateInputs({
    txRecordsMerkleTree,
    allowedTxRecordsMerkleTree,
    accInnocentNullifiersMerkleTree,
  }) {
    
  }
}

module.exports = TxRecord
