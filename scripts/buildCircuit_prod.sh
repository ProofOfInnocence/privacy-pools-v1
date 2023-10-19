#!/bin/bash -e

unzip resources/transaction$1.zkey.zip -d artifacts/circuits/
npx snarkjs zkey export solidityverifier artifacts/circuits/transaction$1.zkey artifacts/circuits/Verifier$1.sol
sed -i.bak "s/contract Verifier/contract Verifier${1}/g" artifacts/circuits/Verifier$1.sol
