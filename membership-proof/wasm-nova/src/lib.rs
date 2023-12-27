#[cfg(not(target_family = "wasm"))]
pub mod cbor;

#[cfg(target_family = "wasm")]
pub mod wasm;

