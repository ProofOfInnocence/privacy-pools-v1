to compile circom to r1cs, use 

```sh
circom circuits/proofOfInnocence.circom --r1cs --wasm -o wasm-nova/output
```

to create pp cbor from r1cs, in wasm-nova

```sh
cargo run --release
```

to test wasm

```sh
wasm-pack test --release --node --chrome
```

to create pkg folder

```sh
wasm-pack build --target web --out-dir pkg
```

To use normal nova scotia, use a.rs


Single command to compile and run

```sh
circom ../circuits/proofOfInnocence.circom --r1cs --wasm -o ./output && rustup override set 1.70.0 && cargo run --release && rustup override set nightly-2022-12-12 && wasm-pack test --release --node --chrome
```