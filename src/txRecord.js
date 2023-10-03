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

  generateInputs({
    txRecordsMerkleTree,
    allowedTxRecordsMerkleTree,
    accInnocentCommitmentsMerkleTree,
    isLastStep = false,
    stepCount,
  }) {
    const txRecord = toFixedHex(this.hash())
    if (this.index == 0) {
      return
    }
    console.log('txRecord: ', txRecord)
    console.log('txRecordsMerkleTree: ', txRecordsMerkleTree)
    const txRecordsPathIndex = txRecordsMerkleTree.indexOf(txRecord)
    const txRecordsPathElements = txRecordsMerkleTree.path(this.index).pathElements

    isLastStep = isLastStep ? 1 : 0
    const step_in = poseidonHash([
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleTree.root(),
    ])

    var allowedTxRecordsPathIndex = null
    var allowedTxRecordsPathElements = null

    if (this.publicAmount > 0) {
      allowedTxRecordsPathIndex = allowedTxRecordsMerkleTree.indexOf(txRecord)
      allowedTxRecordsPathElements = allowedTxRecordsMerkleTree.path(this.index).pathElements
    } else {
      return
    }

    var inPrivateKey = []
    var inputNullifier = []
    var inAmount = []
    var inBlinding = []
    var inPathIndices = []
    // var inPathElements = []
    var outputCommitment = []
    var outAmount = []
    var outPubkey = []
    var outBlinding = []

    for (var i = 0; i < this.inputs.length; i++) {
      console.log(inPrivateKey, this.inputs[i].keypair.privkey)
      inPrivateKey.push(this.inputs[i].keypair.privkey)
      inputNullifier.push(this.inputs[i].getNullifier())
      inAmount.push(this.inputs[i].amount)
      inBlinding.push(this.inputs[i].blinding)
      inPathIndices.push(this.inputs[i].index)
      // inPathElements.push(txRecordsMerkleTree.path(this.))
    }

    var outCommitmentsHashWithIndex = []
    console.log('----length: ', this.outputs.length)
    for (var j = 0; j < this.outputs.length; j++) {
      outputCommitment.push(this.outputs[j].getCommitment())
      outAmount.push(this.outputs[j].amount)
      outPubkey.push(this.outputs[j].keypair.privkey)
      outBlinding.push(this.outputs[j].blinding)
      outCommitmentsHashWithIndex.push(poseidonHash([this.outputs[j].getCommitment(), this.index + j]))
      // console.log('====accInnocentComMT before: ', accInnocentCommitmentsMerkleTree)
      // console.log('pushing outCommitmentsHashWithIndex: ', outCommitmentsHashWithIndex[j])
      console.log('----outCommitmentsList', outCommitmentsHashWithIndex)
      accInnocentCommitmentsMerkleTree.insert(outCommitmentsHashWithIndex[j])
      // console.log('====accInnocentComMT after: ', accInnocentCommitmentsMerkleTree)
    }

    console.log('----outCommitmentsList', outCommitmentsHashWithIndex)

    const accInnocentOutputPathElements = accInnocentCommitmentsMerkleTree
      .path(2 * stepCount)
      .pathElements.slice(0, -1) // may be .slice(1)

    const step_outHasher = poseidonHash([
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleTree.root(),
    ])
    const step_out = step_outHasher + isLastStep * (this.hash() - step_outHasher)

    console.log('####################')
    console.log(txRecordsPathElements, 2 * stepCount, inPrivateKey, outputCommitment)

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
      // inPathElements: inPathElements,
      outputCommitment: outputCommitment,
      outAmount: outAmount,
      outPubkey: outPubkey,
      outBlinding: outBlinding,
      // outPathIndices: null,
    }
  }
}

module.exports = TxRecord
