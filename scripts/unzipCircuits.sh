#!/bin/bash -e

# Create the directory if it doesn't exist
mkdir -p ./artifacts/circuits

# Unzip the files into the specified directory
unzip ./resources/transaction2.wasm.zip -d ./artifacts/circuits
unzip ./resources/transaction2.zkey.zip -d ./artifacts/circuits
