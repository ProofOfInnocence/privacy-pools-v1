#[cfg(not(target_family = "wasm"))]
use wasm_nova::cbor::create_cbor;

#[cfg(not(target_family = "wasm"))]
fn main() {
    println!("hello");
    create_cbor();
}

#[cfg(target_family = "wasm")]
fn main() {
    println!("wasm");
}