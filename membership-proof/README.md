to compile circom to r1cs, use

```sh
circom circuits/proofOfInnocence.circom --r1cs --wasm -o wasm/output
```

to create pp cbor from r1cs, in `wasm` (do not create main.rs as this would break wasm tests)

```sh
cargo run --example cbor
```

to test wasm (make sure there is no main.rs)

```sh
wasm-pack test --release --node --chrome
```

to create pkg folder

```sh
wasm-pack build --target web --out-dir pkg
```

