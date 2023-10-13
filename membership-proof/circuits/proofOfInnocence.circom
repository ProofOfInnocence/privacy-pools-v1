pragma circom 2.0.6;


include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "./merkleProof.circom";
include "./merkleTreeUpdater.circom";
include "./keypair.circom";

// checks if a number is bigger than a constant
template IsNum2Bits(n) {
    signal input in;
    signal output out[n];
    signal output isLower;
    var lc1=0;

    var e2=1;
    for (var i = 0; i<n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] -1 ) === 0;
        lc1 += out[i] * e2;
        e2 = e2+e2;
    }

    component isEqual = IsEqual();
    isEqual.in[0] <== lc1;
    isEqual.in[1] <== in;
    isLower <== isEqual.out;
}

// step circuit for Nova
template Step(levels, nIns, nOuts, zeroLeaf) {
    signal input step_in;
    // step_out = Hash(txRecordsMerkleRoot, allowedTxRecordsMerkleRoot, newAccInnocentCommitmentMerkleRoot)
    // if not last step, otherwise txHash
    signal output step_out;
    // Merkle roots of the three MTs
    signal input txRecordsMerkleRoot;
    signal input allowedTxRecordsMerkleRoot;
    // signal input accInnocentCommitmentsHash;
    // First MT: txRecordMT created by events
    signal input txRecordsPathElements[levels];
    signal input txRecordsPathIndex;
    // Second MT: allowedTxRecordMT given by the authorities
    signal input allowedTxRecordsPathElements[levels];
    signal input allowedTxRecordsPathIndex;
    // Third MT: accInnocentCommitmentMT created by the user
    signal input accInnocentCommitments[nIns];
    // signal input accInnocentCommitmentsPathElements[nIns][levels];
    // signal input accInnocentCommitmentsPathIndex[nIns];
    // checks if last step is reached
    signal input isLastStep;
    // info belongs to outputCommitments helping writing them in accInnocentCommitmentMT
    // signal input accInnocentOutputPathElements[levels - 1];
    // signal input accInnocentOutputPathIndex;
    // public amount of the transaction, if greater than zero, it is a deposit, otherwise it is a withdrawal
    signal input publicAmount;
    // outputsStartIndex = index of the first outputCommitment in the commitmentMT from the contract
    signal input outputsStartIndex;
    // data for transaction inputs
    signal input inputNullifier[nIns];
    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    // data for transaction outputs
    signal input outputCommitment[nOuts];
    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];

    // calculate accInnocentCommitmentsHash
    component accInnocentCommitmentsHasher = Poseidon(2);
        for (var i = 0; i < nIns; i++) {
        accInnocentCommitmentsHasher.inputs[i] <== accInnocentCommitments[i];
    }
    // step_in = Hash(txRecordsMerkleRoot, allowedTxRecordsMerkleRoot, accInnocentCommitmentMerkleRoot)
    component stepInHasher = Poseidon(3);
    stepInHasher.inputs[0] <== txRecordsMerkleRoot;
    stepInHasher.inputs[1] <== allowedTxRecordsMerkleRoot;
    stepInHasher.inputs[2] <== accInnocentCommitmentsHasher.out;

    stepInHasher.out === step_in;

    // ensure that isLastStep is either 0 or 1
    0 === isLastStep * (1 - isLastStep);

    // 1 - calculate txRecord
    // txRecord = Hash(Hash(Hash(inputNullifier1, inputNullifier2, outputCommitment1, outputCommitment2), publicAmount), outputsStartIndex)
    component inputsOutputsHasher = Poseidon(nIns + nOuts);
    for (var i = 0; i < nIns; i++) {
        inputsOutputsHasher.inputs[i] <== inputNullifier[i];
    }
    for (var i = 0; i < nOuts; i++) {
        inputsOutputsHasher.inputs[nIns + i] <== outputCommitment[i];
    }
    component txRecordWithoutIndexHasher = Poseidon(2);
    txRecordWithoutIndexHasher.inputs[0] <== inputsOutputsHasher.out;
    txRecordWithoutIndexHasher.inputs[1] <== publicAmount;

    component txRecordHasher = Poseidon(2);
    txRecordHasher.inputs[0] <== txRecordWithoutIndexHasher.out;
    txRecordHasher.inputs[1] <== outputsStartIndex;

    // 2 - calculate txRecord merkle path
    component txRecordTree = MerkleProof(levels);
    txRecordTree.leaf <== txRecordHasher.out;
    txRecordTree.pathIndices <== txRecordsPathIndex;
    for (var i = 0; i < levels; i++) {
        txRecordTree.pathElements[i] <== txRecordsPathElements[i];
    }
    // check whether txRecord is in txRecordsMT if it is not the last step
    component checkTxRecordsRoot = ForceEqualIfEnabled();
    checkTxRecordsRoot.in[0] <== txRecordsMerkleRoot;
    checkTxRecordsRoot.in[1] <== txRecordTree.root;
    checkTxRecordsRoot.enabled <== (1 - isLastStep);

    // 3 - if publicAmount is positive (deposit), check if it is in allowlist 
    component allowedTxRecordTree = MerkleProof(levels);
    allowedTxRecordTree.leaf <== txRecordHasher.out;
    allowedTxRecordTree.pathIndices <== allowedTxRecordsPathIndex;
    for (var i = 0; i < levels; i++) {
        allowedTxRecordTree.pathElements[i] <== allowedTxRecordsPathElements[i];
    }
    component checkAllowlistRoot = ForceEqualIfEnabled();
    checkAllowlistRoot.in[0] <== allowedTxRecordsMerkleRoot;
    checkAllowlistRoot.in[1] <== allowedTxRecordTree.root;
    //check if publicAmount is positive
    component isDeposit = IsNum2Bits(240);
    isDeposit.in <== publicAmount;
    checkAllowlistRoot.enabled <== isDeposit.isLower;

    //components for calculating txRecord input info
    component inKeypair[nIns];
    component inSignature[nIns];
    component inCommitmentHasher[nIns];
    component inNullifierHasher[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];
    component inCommitmentandIdxHasher[nIns];

    // verify correctness of transaction inputs
    for (var tx = 0; tx < nIns; tx++) {
        inKeypair[tx] = Keypair();
        inKeypair[tx].privateKey <== inPrivateKey[tx];

        inCommitmentHasher[tx] = Poseidon(3);
        inCommitmentHasher[tx].inputs[0] <== inAmount[tx];
        inCommitmentHasher[tx].inputs[1] <== inKeypair[tx].publicKey;
        inCommitmentHasher[tx].inputs[2] <== inBlinding[tx];

        inSignature[tx] = Signature();
        inSignature[tx].privateKey <== inPrivateKey[tx];
        inSignature[tx].commitment <== inCommitmentHasher[tx].out;
        inSignature[tx].merklePath <== inPathIndices[tx];

        inNullifierHasher[tx] = Poseidon(3);
        inNullifierHasher[tx].inputs[0] <== inCommitmentHasher[tx].out;
        inNullifierHasher[tx].inputs[1] <== inPathIndices[tx];
        inNullifierHasher[tx].inputs[2] <== inSignature[tx].out;
        inNullifierHasher[tx].out === inputNullifier[tx];

        inCommitmentandIdxHasher[tx] = Poseidon(2);
        inCommitmentandIdxHasher[tx].inputs[0] <== inCommitmentHasher[tx].out;
        inCommitmentandIdxHasher[tx].inputs[1] <== inPathIndices[tx];

        // // check if input commitments is in the accInnocentCommitmentMerkleTree 
        // inTree[tx] = MerkleProof(levels);
        // inTree[tx].leaf <== inCommitmentandIdxHasher[tx].out;
        // inTree[tx].pathIndices <== accInnocentCommitmentsPathIndex[tx];
        // for (var i = 0; i < levels; i++) {
        //     inTree[tx].pathElements[i] <== accInnocentCommitmentsPathElements[tx][i];
        // }

        // check merkle proof only if amount is non-zero
        inCheckRoot[tx] = ForceEqualIfEnabled();
        inCheckRoot[tx].in[0] <== inCommitmentandIdxHasher[tx].out;
        inCheckRoot[tx].in[1] <== accInnocentCommitments[tx];
        inCheckRoot[tx].enabled <== inAmount[tx];

        // We don't need to range check input amounts, since all inputs are valid UTXOs that
        // were already checked as outputs in the previous transaction (or zero amount UTXOs that don't
        // need to be checked either).
    }

    // components for calculating txRecord output info
    component outCommitmentHasher[nOuts];
    component accInnocentOutputHasher[nOuts];
    component accInnocentOutputsHasher = Poseidon(2);
    // verify correctness of tx outputs and calculate Hash(outCommitment, idx)
    for (var tx = 0; tx < nOuts; tx++) {
        outCommitmentHasher[tx] = Poseidon(3);
        outCommitmentHasher[tx].inputs[0] <== outAmount[tx];
        outCommitmentHasher[tx].inputs[1] <== outPubkey[tx];
        outCommitmentHasher[tx].inputs[2] <== outBlinding[tx];
        outCommitmentHasher[tx].out === outputCommitment[tx];
        accInnocentOutputHasher[tx] = Poseidon(2);
        accInnocentOutputHasher[tx].inputs[0] <== outputCommitment[tx];
        accInnocentOutputHasher[tx].inputs[1] <== outputsStartIndex + tx;
        accInnocentOutputsHasher.inputs[tx] <== accInnocentOutputHasher[tx].out;
    }

    // accumulate innocent output commitments with idx
    // component treeUpdater = MerkleTreeUpdater(levels, 1, zeroLeaf);
    // treeUpdater.oldRoot <== accInnocentCommitmentsMerkleRoot;
    // for (var tx = 0; tx < nOuts; tx++) {
    //     treeUpdater.leaves[tx] <== accInnocentOutputHasher[tx].out;
    // }

    // // at every step, index must be increased by 2
    // treeUpdater.pathIndices <== accInnocentOutputPathIndex;
    // for (var i = 0; i < levels - 1; i++) {
    //     treeUpdater.pathElements[i] <== accInnocentOutputPathElements[i];
    // }

    // step_out = Hash(txRecordsMerkleRoot, allowedTxRecordsMerkleRoot, newAccInnocentCommitmentMerkleRoot)
    component stepHasher = Poseidon(3);
    stepHasher.inputs[0] <== txRecordsMerkleRoot;
    stepHasher.inputs[1] <== allowedTxRecordsMerkleRoot;
    stepHasher.inputs[2] <== accInnocentOutputsHasher.out;

    step_out <== stepHasher.out + isLastStep * (txRecordWithoutIndexHasher.out - stepHasher.out);
}

component main{public [step_in]} = Step(5, 2, 2, 11850551329423159860688778991827824730037759162201783566284850822760196767874);
