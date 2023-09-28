include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./merkleProof.circom"
include "./keypair.circom"

/*
Utxo structure:
{
    amount,
    pubkey,
    blinding, // random number
}

commitment = hash(amount, pubKey, blinding)
nullifier = hash(commitment, merklePath, sign(privKey, commitment, merklePath))
*/

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


// Universal JoinSplit transaction with nIns inputs and 2 outputs
template Transaction(levels, nIns, nOuts, zeroLeaf) {
    signal         input txRecordsMerkleRoot;
    signal private input txRecordPathElements[levels];
    signal private input txRecordPathIndex;

    signal         input allowedTxRecordsMerkleRoot;
    signal private input allowedTxRecordPathElements[levels];
    signal private input allowedTxRecordPathIndex;

    signal         input accInnocentNullifiersMerkleRoot;
    signal         output newAccInnocentNullifiersMerkleRoot;
    signal private input accInnocentNullifierPathElements[nIns][levels];
    signal private input accInnocentNullifierPathIndex[nIns];
    // extAmount = external amount used for deposits and withdrawals
    // correct extAmount range is enforced on the smart contract
    // publicAmount = extAmount - fee
    signal private input publicAmount;
    signal private input outputsStartIndex;

    // data for transaction inputs
    signal private input inputNullifier[nIns];
    signal private input inAmount[nIns];
    signal private input inPrivateKey[nIns];
    signal private input inBlinding[nIns];
    signal private input inPathIndices[nIns];
    signal private input inPathElements[nIns][levels];

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

    // 3 - if publicAmount is positive (deposit), check if it is in allowlist
    component allowedTxRecordTree = MerkleProof(levels);
    allowedTxRecordTree.leaf <== txRecordHasher.out;
    allowedTxRecordTree.pathIndices <== allowedTxRecordPathIndex;
    for (var i = 0; i < levels; i++) {
        allowedTxRecordTree.pathElements[i] <== allowedTxRecordPathElements[i];
    }
    component checkAllowlistRoot = ForceEqualIfEnabled();
    checkAllowlistRoot.in[0] <== root;
    checkAllowlistRoot.in[1] <== inTree[tx].root;

    component isDeposit = IsNum2Bits(240);
    isDeposit.in <== publicAmount;
    checkAllowlistRoot.enabled <== isDeposit.isLower;




    component inKeypair[nIns];
    component inSignature[nIns];
    component inCommitmentHasher[nIns];
    component inNullifierHasher[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];

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

        inTree[tx] = MerkleProof(levels);
        inTree[tx].leaf <== inputNullifier[tx];
        inTree[tx].pathIndices <== accInnocentNullifierPathIndex[tx];
        for (var i = 0; i < levels; i++) {
            inTree[tx].pathElements[i] <== accInnocentNullifierPathElements[tx][i];
        }

        // check merkle proof only if amount is non-zero
        inCheckRoot[tx] = ForceEqualIfEnabled();
        inCheckRoot[tx].in[0] <== accInnocentNullifiersMerkleRoot;
        inCheckRoot[tx].in[1] <== inTree[tx].root;
        inCheckRoot[tx].enabled <== inAmount[tx];

        // We don't need to range check input amounts, since all inputs are valid UTXOs that
        // were already checked as outputs in the previous transaction (or zero amount UTXOs that don't
        // need to be checked either).
    }


    // calculate output nulliier

    component outKeypair[nOuts];
    component outSignature[nOuts];
    component outCommitmentHasher[nOuts];
    component outNullifierHasher[nOuts];
    component outTree[nOuts];
    component outCheckRoot[nOuts];
    var sumIns = 0;

    // verify correctness of transaction inputs
    for (var tx = 0; tx < nOuts; tx++) {
        outKeypair[tx] = Keypair();
        outKeypair[tx].privateKey <== outPrivateKey[tx];

        outCommitmentHasher[tx] = Poseidon(3);
        outCommitmentHasher[tx].inputs[0] <== outAmount[tx];
        outCommitmentHasher[tx].inputs[1] <== outKeypair[tx].publicKey;
        outCommitmentHasher[tx].inputs[2] <== outBlinding[tx];

        outSignature[tx] = Signature();
        outSignature[tx].privateKey <== outPrivateKey[tx];
        outSignature[tx].commitment <== outCommitmentHasher[tx].out;
        outSignature[tx].merklePath <== outPathIndices[tx];

        outNullifierHasher[tx] = Poseidon(3);
        outNullifierHasher[tx].inputs[0] <== outCommitmentHasher[tx].out;
        outNullifierHasher[tx].inputs[1] <== outputsStartIndex + tx;
        outNullifierHasher[tx].inputs[2] <== outSignature[tx].out;
    }

    component treeUpdater = MerkleTreeUpdater(levels, 1, zeroLeaf);
    treeUpdater.oldRoot <== accInnocentNullifiersMerkleRoot;

    // update merkle tree with output nullifiers
    for (var tx = 0; tx < nOuts; tx++) {
        treeUpdater.leaves[tx] <== outNullifierHasher[tx].out;
    }

    treeUpdater.pathIndices <== accInnocentNullifierPathIndex; // TODO: check if this is correct
    for (var i = 0; i < levels - 1; i++) {
        treeUpdater.pathElements[i] <== accInnocentNullifierPathElements[i]; // TODO: check if this is correct
    }

    newAccInnocentNullifiersMerkleRoot <== treeUpdater.newRoot;


}
