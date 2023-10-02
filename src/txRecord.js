const { poseidonHash, toFixedHex } = require('./utils')

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
    isLastStep = false
  }) {
    const txRecord = toFixedHex(this.hash());
    const txRecordsPathIndex = txRecordsMerkleTree.indexOf(txRecord);
    const txRecordsPathElements = txRecordsMerkleTree.path(this.index).pathElements;

    const allowedTxRecordsPathIndex = allowedTxRecordsMerkleTree.indexOf(txRecord);
    const allowedTxRecordsPathElements = allowedTxRecordsMerkleTree.path(this.index).pathElements;
    isLastStep = isLastStep ? 1 : 0;
    

    return {
      txRecordsPathElements: null,
      txRecordsPathIndex: null,
      allowedTxRecordsPathElements: null,
      allowedTxRecordsPathIndex: null,
      accInnocentNullifiersPathElements: null,
      accInnocentNullifiersPathIndex: null,
      isLastStep: null,
      txRecordsMerkleRoot: null,
      allowedTxRecordsMerkleRoot: null,
      accInnocentNullifiersMerkleRoot: null,
      step_in: null,
      step_out: null,
      accInnocentOutputPathElements: null,
      accInnocentOutputPathIndex: null,
      extAmount: null,
      publicAmount: null,
      outputsStartIndex: null,
      inputNullifier: null,
      inAmount: null,
      inPrivateKey: null,
      inBlinding: null,
      inPathIndices: null,
      inPathElements: null,
      outputCommitment: null,
      outAmount: null,
      outPubkey: null,
      outBlinding: null,
      outPathIndices: null,
    }
  }
}

module.exports = TxRecord
