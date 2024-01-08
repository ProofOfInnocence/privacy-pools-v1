#[cfg(target_family = "wasm")]
use wasm_bindgen_test::*;
use wasm_nova::wasm::{
    generate_params, generate_proof, read_filem
};
use web_sys::window; // Import the window function


#[wasm_bindgen_test]
async fn ftest() {
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);
    generate_params("output/proofOfInnocence.cbor", "http://127.0.0.1:8000").await;
}

#[wasm_bindgen_test]
async fn gtest() {
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);
    let pp = generate_params("output/proofOfInnocence.cbor", "http://127.0.0.1:8000").await;
    let input_json_str = read_filem("output/inputs.json", "http://127.0.0.1:8000").await;
    let start_json_str = read_filem("output/start.json", "http://127.0.0.1:8000").await;
    // Start timing
    let performance = window().expect("should have a Window").performance().expect("should have a Performance");
    let start_time = performance.now();
    
    generate_proof(pp, "output/proofOfInnocence.r1cs", "output/proofOfInnocence_js/proofOfInnocence.wasm", &input_json_str, &start_json_str, "http://127.0.0.1:8000").await;

    // End timing
    let end_time = performance.now();
    let elapsed_time = end_time - start_time;
    console_log!("Elapsed time: {} milliseconds", elapsed_time);
    
}