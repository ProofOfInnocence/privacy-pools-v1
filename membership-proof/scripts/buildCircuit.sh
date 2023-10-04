#!/bin/bash -e
POWERS_OF_TAU=15 # circuit will support max 2^POWERS_OF_TAU constraints
mkdir -p membership-proof/artifacts/circuits
if [ ! -f membership-proof/artifacts/circuits/ptau$POWERS_OF_TAU ]; then
  echo "Downloading powers of tau file"
  curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_$POWERS_OF_TAU.ptau --create-dirs -o membership-proof/artifacts/circuits/ptau$POWERS_OF_TAU
fi
circom membership-proof/circuits/proofOfInnocence.circom --r1cs --wasm -o membership-proof/artifacts/circuits/
npx snarkjs groth16 setup membership-proof/artifacts/circuits/proofOfInnocence.r1cs membership-proof/artifacts/circuits/ptau$POWERS_OF_TAU membership-proof/artifacts/circuits/tmp_proofOfInnocence.zkey
echo "qwe" | npx snarkjs zkey contribute membership-proof/artifacts/circuits/tmp_proofOfInnocence.zkey membership-proof/artifacts/circuits/proofOfInnocence.zkey
npx snarkjs info -r membership-proof/artifacts/circuits/proofOfInnocence.r1cs
mv membership-proof/artifacts/circuits/proofOfInnocence_js/proofOfInnocence.wasm membership-proof/artifacts/circuits/
