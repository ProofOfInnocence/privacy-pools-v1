to compile circom to r1cs, use 

```sh
circom circuits/proofOfInnocence.circom --r1cs --wasm -o wasm-nova/output
```

to create pp cbor from r1cs, in wasm-nova

```sh
cargo run --release --example cbor --target x86_64-unknown-linux-gnu
```

to test wasm

```sh
wasm-pack test --node --chrome
```

To use normal nova scotia, use

```sh
cargo run --release --example a --target x86_64-unknown-linux-gnu
```
