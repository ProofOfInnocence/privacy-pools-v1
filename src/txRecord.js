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
    const txRecordsPathIndex = txRecordsMerkleTree.indexOf(txRecord)
    const txRecordsPathElements = txRecordsMerkleTree.path(txRecordsPathIndex).pathElements

    isLastStep = isLastStep ? 1 : 0
    const step_in = poseidonHash([
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleTree.root(),
    ])

    var allowedTxRecordsPathIndex = null
    var allowedTxRecordsPathElements = null

    if (BigInt(this.publicAmount) < BigInt(2) ** BigInt(240)) {
      allowedTxRecordsPathIndex = allowedTxRecordsMerkleTree.indexOf(txRecord)
      if (allowedTxRecordsPathIndex == -1) {
        throw new Error('txRecord not found in allowedTxRecordsMerkleTree')
      }
      allowedTxRecordsPathElements = allowedTxRecordsMerkleTree.path(allowedTxRecordsPathIndex).pathElements
    } else {
      allowedTxRecordsPathIndex = 0
      allowedTxRecordsPathElements = new Array(allowedTxRecordsMerkleTree.levels).fill(0)
    }

    var inPrivateKey = []
    var inputNullifier = []
    var inAmount = []
    var inBlinding = []
    var inPathIndices = []
    var outputCommitment = []
    var outAmount = []
    var outPubkey = []
    var outBlinding = []
    var accInnocentCommitmentsPathElements = []
    var accInnocentCommitmentsPathIndex = []

    for (var i = 0; i < this.inputs.length; i++) {
      inPrivateKey.push(this.inputs[i].keypair.privkey)
      inputNullifier.push(this.inputs[i].getNullifier())
      inAmount.push(this.inputs[i].amount)
      inBlinding.push(this.inputs[i].blinding)
      inPathIndices.push(this.inputs[i].index)
      if (this.inputs[i].amount > 0) {
        const curBlindedCommitment = poseidonHash([this.inputs[i].getCommitment(), this.inputs[i].index])

        const curAccInnocentIndex = accInnocentCommitmentsMerkleTree.indexOf(curBlindedCommitment)
        if (curAccInnocentIndex == -1) {
          throw new Error('Blinded commitment not found in accInnocentCommitmentsMerkleTree')
        }
        accInnocentCommitmentsPathIndex.push(curAccInnocentIndex)
        accInnocentCommitmentsPathElements.push(
          accInnocentCommitmentsMerkleTree.path(curAccInnocentIndex).pathElements,
        )
      } else {
        accInnocentCommitmentsPathIndex.push(0)
        accInnocentCommitmentsPathElements.push(new Array(accInnocentCommitmentsMerkleTree.levels).fill(0))
      }
    }

    var outCommitmentsHashWithIndex = []
    // console.log('----length: ', this.outputs.length)
    for (var j = 0; j < this.outputs.length; j++) {
      outputCommitment.push(this.outputs[j].getCommitment())
      outAmount.push(this.outputs[j].amount)
      outPubkey.push(this.outputs[j].keypair.privkey)
      outBlinding.push(this.outputs[j].blinding)
      // outCommitmentsHashWithIndex.push(poseidonHash([this.outputs[j].getCommitment(), this.index + j]))
      // console.log('====accInnocentComMT before: ', accInnocentCommitmentsMerkleTree)
      // console.log('pushing outCommitmentsHashWithIndex: ', outCommitmentsHashWithIndex[j])
      // console.log('----outCommitmentsList', outCommitmentsHashWithIndex)
      // accInnocentCommitmentsMerkleTree.insert(outCommitmentsHashWithIndex[j])
      // console.log('====accInnocentComMT after: ', accInnocentCommitmentsMerkleTree)
    }

    // console.log('----outCommitmentsList', outCommitmentsHashWithIndex)
    const accInnocentCommitmentsMerkleRoot = accInnocentCommitmentsMerkleTree.root()
    accInnocentCommitmentsMerkleTree.insert('0x00')
    const accInnocentOutputPathIndex = accInnocentCommitmentsMerkleTree.elements().length - 1
    const accInnocentOutputPathElements = accInnocentCommitmentsMerkleTree
      .path(accInnocentOutputPathIndex)
      .pathElements.slice(1) // may be .slice(1)

    // const step_outHasher = poseidonHash([
    //   txRecordsMerkleTree.root(),
    //   allowedTxRecordsMerkleTree.root(),
    //   accInnocentCommitmentsMerkleTree.root(),
    // ])
    // const step_out = step_outHasher + isLastStep * (this.hash() - step_outHasher)

    console.log('####################')
    console.log('some info: ', txRecordsPathElements, 2 * stepCount, inPrivateKey, outputCommitment)

    return {
      txRecordsPathElements: txRecordsPathElements,
      txRecordsPathIndex: txRecordsPathIndex,
      allowedTxRecordsPathElements: allowedTxRecordsPathElements,
      allowedTxRecordsPathIndex: allowedTxRecordsPathIndex,
      accInnocentCommitmentsPathElements: accInnocentCommitmentsPathElements,
      accInnocentCommitmentsPathIndex: accInnocentCommitmentsPathIndex,
      isLastStep: isLastStep,
      txRecordsMerkleRoot: txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleRoot: allowedTxRecordsMerkleTree.root(),
      accInnocentCommitmentsMerkleRoot: accInnocentCommitmentsMerkleRoot,
      step_in: step_in,
      accInnocentOutputPathElements: accInnocentOutputPathElements,
      accInnocentOutputPathIndex: accInnocentOutputPathIndex,
      publicAmount: this.publicAmount,
      outputsStartIndex: this.index,
      inputNullifier: inputNullifier,
      inAmount: inAmount,
      inPrivateKey: inPrivateKey,
      inBlinding: inBlinding,
      inPathIndices: inPathIndices,
      outputCommitment: outputCommitment,
      outAmount: outAmount,
      outPubkey: outPubkey,
      outBlinding: outBlinding,
    }
  }
}

module.exports = TxRecord
