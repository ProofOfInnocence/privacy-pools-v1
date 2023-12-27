const { BigNumber } = require('ethers')
const { poseidonHash, toFixedHex, poseidonHash2 } = require('./utils')

class TxRecord {
  constructor({ inputs = [], outputs = [], publicAmount = 0, index = 0 }) {
    this.inputs = inputs
    this.outputs = outputs
    this.publicAmount = publicAmount
    this.index = index
  }

  hash() {
    return poseidonHash([
      // poseidonHash([
        // poseidonHash([
          this.inputs[0].getNullifier(),
          // this.inputs[1].getNullifier(),
          this.outputs[0].getCommitment(),
          // this.outputs[1].getCommitment(),
        // ]),
        this.publicAmount,
      // ]),
      this.index,
    ])
  }

  static hashFromEvent(event) {
    return poseidonHash([
      // poseidonHash([
      //   poseidonHash([
          event.args.inputNullifier1,
          // event.args.inputNullifier2,
          event.args.outputCommitment1,
          // event.args.outputCommitment2,
        // ]),
        event.args.publicAmount,
      // ]),
      event.args.index,
    ])
  }

  generateInputs({
    txRecordsMerkleTree,
    allowedTxRecordsMerkleTree,
    accInnocentCommitments,
    isLastStep = false,
  }) {
    const txRecord = toFixedHex(this.hash())
    let txRecordsPathIndex
    let txRecordsPathElements
    if (!isLastStep) {
      txRecordsPathIndex = txRecordsMerkleTree.indexOf(txRecord)
      txRecordsPathElements = txRecordsMerkleTree.path(txRecordsPathIndex).pathElements
    } else {
      txRecordsPathIndex = 0
      txRecordsPathElements = new Array(txRecordsMerkleTree.levels).fill(0)
    }

    isLastStep = isLastStep ? 1 : 0
    const step_in = poseidonHash([
      txRecordsMerkleTree.root(),
      allowedTxRecordsMerkleTree.root(),
      accInnocentCommitments[0],
      // poseidonHash2(accInnocentCommitments[0], accInnocentCommitments[1]),
    ])

    let allowedTxRecordsPathIndex = null
    let allowedTxRecordsPathElements = null
    if (BigNumber.from(this.publicAmount).lt(BigNumber.from(2).pow(240))) {
      
      allowedTxRecordsPathIndex = allowedTxRecordsMerkleTree.indexOf(txRecord)
      if (allowedTxRecordsPathIndex == -1) {
        throw new Error('txRecord not found in allowedTxRecordsMerkleTree')
      }
      allowedTxRecordsPathElements = allowedTxRecordsMerkleTree.path(allowedTxRecordsPathIndex).pathElements
    } else {
      allowedTxRecordsPathIndex = 0
      allowedTxRecordsPathElements = new Array(allowedTxRecordsMerkleTree.levels).fill(0)
    }

    let inPrivateKey = []
    let inputNullifier = []
    let inAmount = []
    let inBlinding = []
    let inPathIndices = []
    let outputCommitment = []
    let outAmount = []
    let outPubkey = []
    let outBlinding = []

    for (let i = 0; i < this.inputs.length; i++) {
      inPrivateKey.push(this.inputs[i].keypair.privkey)
      inputNullifier.push(this.inputs[i].getNullifier())
      inAmount.push(this.inputs[i].amount)
      inBlinding.push(this.inputs[i].blinding)
      inPathIndices.push(this.inputs[i].index)
    }
    let outputInnocentCommitments = []
    for (let j = 0; j < this.outputs.length; j++) {
      outputCommitment.push(this.outputs[j].getCommitment())
      outAmount.push(this.outputs[j].amount)
      outPubkey.push(this.outputs[j].keypair.pubkey)
      outBlinding.push(this.outputs[j].blinding)
      // console.log(this)
      outputInnocentCommitments.push(
        poseidonHash([this.outputs[j].getCommitment(), isLastStep ? 0 : this.outputs[j].index]),
      )
    }
    return {
      stepInputs: {
        txRecordsPathElements: txRecordsPathElements,
        txRecordsPathIndex: txRecordsPathIndex,
        // allowedTxRecordsPathElements: allowedTxRecordsPathElements,
        // allowedTxRecordsPathIndex: allowedTxRecordsPathIndex,
        accInnocentCommitments,
        isLastStep: isLastStep,
        txRecordsMerkleRoot: txRecordsMerkleTree.root(),
        allowedTxRecordsMerkleRoot: allowedTxRecordsMerkleTree.root(),
        step_in: step_in,
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
      },
      outputInnocentCommitments,
    }
  }
}

module.exports = TxRecord
