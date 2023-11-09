#[cfg(target_family = "wasm")]
use wasm_bindgen_test::*;
use wasm_nova::wasm::generate_params;

#[wasm_bindgen_test]
async fn ftest() {
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);
    generate_params("output/proofOfInnocence.cbor", "http://127.0.0.1:8000").await;
}
