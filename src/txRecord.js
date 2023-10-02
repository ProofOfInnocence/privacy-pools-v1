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

  static generateInputs({
    txRecordsMerkleTree,
    allowedTxRecordsMerkleTree,
    accInnocentCommitmentsMerkleTree,
    isLastStep = false,
    stepCount,
  }) {
    const txRecord = toFixedHex(this.hash())
    const txRecordsPathIndex = txRecordsMerkleTree.indexOf(txRecord)
    const txRecordsPathElements = txRecordsMerkleTree.path(this.index).pathElements

    isLastStep = isLastStep ? 1 : 0

    const step_in = poseidonHash(
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleTree.root(),
    )

    var allowedTxRecordsPathIndex = null
    var allowedTxRecordsPathElements = null

    if (this.publicAmount > 0) {
      allowedTxRecordsPathIndex = allowedTxRecordsMerkleTree.indexOf(txRecord)
      allowedTxRecordsPathElements = allowedTxRecordsMerkleTree.path(this.index).pathElements
    } else {
      return Error('publicAmount must be greater than 0')
    }

    var inPrivateKey = []
    var inputNullifier = []
    var inAmount = []
    var inBlinding = []
    var inPathIndices = []
    var inPathElements = []
    var outputCommitment = []
    var outAmount = []
    var outPubkey = []
    var outBlinding = []

    for (var i = 0; i < this.inputs.length; i++) {
      inPrivateKey.append(this.inputs[i].getPrivateKey())
      inputNullifier.append(this.inputs[i].getNullifier())
      inAmount.append(this.inputs[i].getAmount())
      inBlinding.append(this.inputs[i].getBlinding())
      inPathIndices.append(this.inputs[i].getPathIndex())
      inPathElements.append(this.inputs[i].getPathElements())
    }

    var outCommitmentsHashWithIndex = []

    for (var j = 0; j < this.outputs.length; i++) {
      outputCommitment.append(this.outputs[j].getCommitment())
      outAmount.append(this.outputs[j].getAmount())
      outPubkey.append(this.outputs[j].getPubkey())
      outBlinding.append(this.outputs[j].getBlinding())
      outCommitmentsHashWithIndex.append(poseidonHash(this.outputs[j].getCommitment(), this.index + i))
      accInnocentCommitmentsMerkleTree.insert(outCommitmentsHashWithIndex[j])
    }

    const accInnocentOutputPathElements = accInnocentCommitmentsMerkleTree
      .path(2 * stepCount)
      .pathElements.slice(0, -1) // may be .slice(1)

    const step_outHasher = poseidonHash(
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleTree.root(),
    )
    const step_out = step_outHasher + isLastStep * (this.hash() - step_outHasher)

    return {
      txRecordsPathElements: txRecordsPathElements,
      txRecordsPathIndex: txRecordsPathIndex,
      allowedTxRecordsPathElements: allowedTxRecordsPathIndex,
      allowedTxRecordsPathIndex: allowedTxRecordsPathElements,
      // accInnocentCommitmentsPathElements: accInnocentCommitmentsPathElements,
      // accInnocentCommitmentsPathIndex: accInnocentCommitmentsPathIndex,
      isLastStep: isLastStep,
      txRecordsMerkleRoot: txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleRoot: allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleRoot: accInnocentCommitmentsMerkleTree.root(),
      step_in: step_in,
      step_out: step_out,
      accInnocentOutputPathElements: accInnocentOutputPathElements,
      accInnocentOutputPathIndex: 2 * stepCount,
      // extAmount: null,
      publicAmount: this.publicAmount,
      outputsStartIndex: this.index,
      inputNullifier: inputNullifier,
      inAmount: inAmount,
      inPrivateKey: inPrivateKey,
      inBlinding: inBlinding,
      inPathIndices: inPathIndices,
      inPathElements: inPathElements,
      outputCommitment: outputCommitment,
      outAmount: outAmount,
      outPubkey: outPubkey,
      outBlinding: outBlinding,
      // outPathIndices: null,
    }
  }
}

module.exports = TxRecord
