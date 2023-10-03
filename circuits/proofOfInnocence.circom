include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
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

    component isEqual = IsEqual()
    isEqual.in[0] <== lc1;
    isEqual.in[1] <== in;
    isLower <== isEqual.out;
}

// Transaction with 2 inputs and 2 outputs
template ProofOfInnocence(levels, nIns, nOuts, zeroLeaf) {

    // First MT: txRecordMT created by events
    signal private input txRecordPathElements[levels];
    signal private input txRecordPathIndex;
    // Second MT: allowedTxRecordMT given by the authorities
    signal private input allowedTxRecordPathElements[levels];
    signal private input allowedTxRecordPathIndex;
    // Third MT: accInnocentCommitmentMT created by the user
    signal private input accInnocentCommitmentPathElements[nIns][levels];
    signal private input accInnocentCommitmentPathIndex[nIns];
    //checks if last step is reached
    // signal private input isLastStep;

    signal private input txRecordsMerkleRoot;
    signal private input allowedTxRecordsMerkleRoot;
    signal private input accInnocentCommitmentMerkleRoot;
    // step_in = Hash(txRecordsMerkleRoot, allowedTxRecordsMerkleRoot, accInnocentCommitmentMerkleRoot)
    signal input step_in;
    // step_out_0 = txRecordsMerkleRoot
    // step_out_1 = allowedTxRecordsMerkleRoot
    // step_out_2 = newAccInnocentCommitmentMerkleRoot
    // step_out = Hash(txRecordsMerkleRoot, allowedTxRecordsMerkleRoot, newAccInnocentCommitmentMerkleRoot)
    signal output step_out;
    // info belongs to outputCommitments helping writing them in accInnocentCommitmentMT
    signal private input accInnocentOutputPathElements[levels - 1];
    signal private input accInnocentOutputPathIndex;
    // extAmount = external amount used for deposits and withdrawals
    // correct extAmount range is enforced on the smart contract
    // publicAmount = extAmount - fee
    signal private input publicAmount;
    // outputsStartIndex = index of the first outputCommitment in the commitmentMT from the contract
    signal private input outputsStartIndex;

    // data for transaction inputs
    signal private input inputNullifier[nIns];
    signal private input inAmount[nIns];
    signal private input inPrivateKey[nIns];
    signal private input inBlinding[nIns];
    signal private input inPathIndices[nIns];

    // data for transaction outputs
    signal private input outputCommitment[nOuts];
    signal private input outAmount[nOuts];
    signal private input outPubkey[nOuts];
    signal private input outBlinding[nOuts];



    // 1 - calculate txRecord
    component inputsOutputsHasher = Poseidon(nIns + nOuts);
    for (var i = 0; i < nIns; i++) {
        inputsOutputsHasher.inputs[i] <== inputNullifier[i];
    }
    for (var i = 0; i < nOuts; i++) {
        inputsOutputsHasher.inputs[nIns + i] <== outputCommitment[i];
    }
    component txRecordHasher = Poseidon(3);
    txRecordHasher.inputs[0] <== inputsOutputsHasher.out;
    txRecordHasher.inputs[1] <== publicAmount;
    txRecordHasher.inputs[2] <== outputsStartIndex;

    // 2 - calculate txRecord merkle path
    component txRecordTree = MerkleProof(levels);
    txRecordTree.leaf <== txRecordHasher.out;
    txRecordTree.pathIndices <== txRecordPathIndex;
    for (var i = 0; i < levels; i++) {
        txRecordTree.pathElements[i] <== txRecordPathElements[i];
    }
 txRecordsMerkleRoot === txRecordTree.root;
    // 3 - if publicAmount is positive (deposit), check if it is in allowlist  SUBJECT TO CHANGE
    component allowedTxRecordTree = MerkleProof(levels);
    allowedTxRecordTree.leaf <== txRecordHasher.out;
    allowedTxRecordTree.pathIndices <== allowedTxRecordPathIndex;
    for (var i = 0; i < levels; i++) {
        allowedTxRecordTree.pathElements[i] <== allowedTxRecordPathElements[i];
    }
    component checkAllowlistRoot = ForceEqualIfEnabled();
    checkAllowlistRoot.in[0] <== allowedTxRecordsMerkleRoot;
    checkAllowlistRoot.in[1] <== allowedTxRecordTree.root;
    //check if publicAmount is positive
    component isDeposit = IsNum2Bits(240);
    isDeposit.in <== publicAmount;
    checkAllowlistRoot.enabled <== isDeposit.isLower;

    // TODO: remove keypair calculation
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

        // check if input commitments is in the accInnocentCommitmentMerkleTree 
        inTree[tx] = MerkleProof(levels);
        inTree[tx].leaf <== inCommitmentandIdxHasher[tx].out;
        inTree[tx].pathIndices <== accInnocentCommitmentPathIndex[tx];
        for (var i = 0; i < levels; i++) {
            inTree[tx].pathElements[i] <== accInnocentCommitmentPathElements[tx][i];
        }

        // check merkle proof only if amount is non-zero
        inCheckRoot[tx] = ForceEqualIfEnabled();
        inCheckRoot[tx].in[0] <== accInnocentCommitmentMerkleRoot;
        inCheckRoot[tx].in[1] <== inTree[tx].root;
        inCheckRoot[tx].enabled <== inAmount[tx];

        // We don't need to range check input amounts, since all inputs are valid UTXOs that
        // were already checked as outputs in the previous transaction (or zero amount UTXOs that don't
        // need to be checked either).
    }

    component outCommitmentHasher[nOuts];
    component accInnocentOutputHasher[nOuts];

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
    }

    // accumulate innocent output commitments with idx
    component treeUpdater = MerkleTreeUpdater(levels, 1, zeroLeaf);
    treeUpdater.oldRoot <== accInnocentCommitmentMerkleRoot;
    for (var tx = 0; tx < nOuts; tx++) {
        treeUpdater.leaves[tx] <== accInnocentOutputHasher[tx].out;
    }

    // at every step, index must be increased by 2
    treeUpdater.pathIndices <== accInnocentOutputPathIndex; // TODO IN CREATING INPUTS: check if this is correct
    for (var i = 0; i < levels - 1; i++) {
        treeUpdater.pathElements[i] <== accInnocentOutputPathElements[i]; // TODO IN CREATING INPUTS: check if this is correct
    }


    // component stepHasher = Poseidon(3);
    // stepHasher.inputs[0] <== txRecordsMerkleRoot;
    // stepHasher.inputs[1] <== allowedTxRecordsMerkleRoot;
    // stepHasher.inputs[2] <== treeUpdater.newRoot;
    
    // step_out <== stepHasher.out + isLastStep * (txRecordHasher.out - stepHasher.out);
    // step_out <== stepHasher.out;

}

// zeroLeaf = Poseidon(zero, zero)
// default `zero` value is keccak256("tornado") % FIELD_SIZE = 21663839004416932945382355908790599225266501822907911457504978515578255421292
component main = ProofOfInnocence(23, 2, 2, 11850551329423159860688778991827824730037759162201783566284850822760196767874);
