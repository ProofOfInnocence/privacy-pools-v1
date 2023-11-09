to compile circom to r1cs, use 

```sh
circom circuits/proofOfInnocence.circom --r1cs --wasm -o artifacts/
```

to create pp cbor from r1cs, use cbor-nova

```sh
cargo run --release
```

to test wasm, use wasm-nova

```sh
wasm-pack test --node --chrome
```
