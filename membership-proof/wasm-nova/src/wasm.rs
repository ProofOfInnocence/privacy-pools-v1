use std::collections::HashMap;

use nova_scotia::{
    circom::{circuit::CircomCircuit, reader::load_r1cs},
    create_recursive_circuit, FileLocation, F, S,
};
// use nova_snark::{provider, traits::circuit::TrivialCircuit, traits::Engine, CompressedSNARK, PublicParams};
use nova_snark::{
    provider::{Bn256Engine, GrumpkinEngine},
    traits::{
        circuit::{StepCircuit, TrivialCircuit},
        snark::RelaxedR1CSSNARKTrait,
        Engine, Group,
    },
    PublicParams, RecursiveSNARK, CompressedSNARK
};

use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

pub use wasm_bindgen_rayon::init_thread_pool;

use js_sys::Uint8Array;

#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    // The `console.log` is quite polymorphic, so we can bind it with multiple
    // signatures. Note that we need to use `js_name` to ensure we always call
    // `log` in JS.
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_u32(a: u32);

    // Multiple arguments too!
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_many(a: &str, b: &str);
}

#[wasm_bindgen(module = "/file.js")]
extern "C" {
    fn read_file_binary(path: &str) -> JsValue;
    fn read_filex(path: &str) -> JsValue;
}

macro_rules! console_log {
    // Note that this is using the `log` function imported above during
    // `bare_bones`
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub async fn read_filem(path: &str, base: &str) -> String {
    let p = get_path(base, path);
    console_log!("url rust x: {}", p);
    let result: Result<JsValue, JsValue> =
        JsFuture::from(js_sys::Promise::from(read_filex(&p))).await;
    let x = result.unwrap().as_string().unwrap();
    return x;
}

#[wasm_bindgen]
pub async fn read_filen(path: &str, base: &str) -> Uint8Array {
    let p = get_path(base, path);
    console_log!("url rust b: {}", p);
    let result = JsFuture::from(js_sys::Promise::from(read_file_binary(&p)))
        .await
        .unwrap();
    console_log!("got the result from js");
    let y = Uint8Array::new(&result);
    console_log!(
        "converted to uint array {}, {}, {}",
        y.get_index(0),
        y.get_index(1),
        y.get_index(2)
    );
    return y;
}

extern crate console_error_panic_hook;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

//const WEBSITE_ROOT: &str = "http://127.0.0.1:3131/";

type E1 = Bn256Engine;
type E2 = GrumpkinEngine;
type EE1 = nova_snark::provider::ipa_pc::EvaluationEngine<E1>;
type EE2 = nova_snark::provider::ipa_pc::EvaluationEngine<E2>;
type S1 = nova_snark::spartan::snark::RelaxedR1CSSNARK<E1, EE1>; // non-preprocessing SNARK
type S2 = nova_snark::spartan::snark::RelaxedR1CSSNARK<E2, EE2>; // non-preprocessing SNARK

fn hexstr_to_4u64(hex_string: String) -> [u64; 4] {
    let a = &hex_string[0..2];
    assert_eq!(a.to_lowercase(), "0x");
    let formatted = format!("{:0>64}", &hex_string[2..]);
    let mut parts = [0u64; 4];
    for i in 0..4 {
        let start = i * 16;
        let end = start + 16;
        let slice = &formatted[start..end];
        let num = u64::from_str_radix(slice, 16).expect("Invalid hex string.");
        parts[3 - i] = num;
    }
    return parts;
}

fn read_circuit_inputs(json_str: &str) -> Vec<HashMap<String, serde_json::Value>> {
    let input_json_str = json_str.to_string();
    let input: serde_json::Value = serde_json::from_str(&input_json_str).unwrap();
    let circuit_inputs = input.as_array().unwrap();
    let mut private_inputs = Vec::new();
    for circuit_input in circuit_inputs {
        let mut private_input = HashMap::new();
        let circuit = circuit_input.as_object().unwrap().clone();
        for (k, v) in circuit {
            private_input.insert(k, v);
        }
        private_inputs.push(private_input);
    }
    return private_inputs;
}

fn read_start_input(json_str: &str) -> Vec<F<E1>> {
    let start_input_str = json_str.to_string();
    let start_input: serde_json::Value = serde_json::from_str(&start_input_str).unwrap();
    let a = start_input
        .as_object()
        .unwrap()
        .get("step_in")
        .unwrap()
        .as_array()
        .unwrap();
    let mut input_vector: Vec<F<E1>> = Vec::new();
    for value in a {
        input_vector.push(F::<E1>::from_raw(hexstr_to_4u64(
            value.as_str().unwrap().to_string(),
        )));
    }
    return input_vector;
}

pub fn get_path(url: &str, filename: &str) -> String {
    return format!("{}/{}", url, filename);
}

#[wasm_bindgen]
pub async fn generate_params(r1cs_cbor_path: &str, base: &str) -> String {
    console_log!("start pp generation from {}", r1cs_cbor_path);
    let tmp = read_filen(r1cs_cbor_path, base).await;
    let cbor = tmp.to_vec();
    let pp = serde_cbor::from_slice::<
        PublicParams<
            E1,
            E2,
            CircomCircuit<<E1 as Engine>::Scalar>,
            TrivialCircuit<<E2 as Engine>::Scalar>,
        >,
    >(&cbor)
    .unwrap();
    console_log!("{}", pp.num_constraints().0);
    return serde_json::to_string(&pp).unwrap();
}

#[wasm_bindgen]
pub async fn generate_proof(
    pp_str: String,
    r1cs_path: &str,
    wasm_path: &str,
    input_json_str: &str,
    start_json_str: &str,
    base: &str,
) -> String {
    console_log!("generating proof");
    let r1cs = load_r1cs::<E1, E2>(&FileLocation::URL(get_path(base, r1cs_path))).await;
    console_log!("r1cs loaded");
    let witness_generator_wasm = FileLocation::URL(get_path(base, wasm_path));

    let private_inputs = read_circuit_inputs(input_json_str);
    console_log!("inputs done");
    let start_public_input = read_start_input(start_json_str);
    console_log!("start input done");

    let pp = serde_json::from_str::<
        PublicParams<
            E1,
            E2,
            CircomCircuit<<E1 as Engine>::Scalar>,
            TrivialCircuit<<E2 as Engine>::Scalar>,
        >,
    >(&pp_str)
    .unwrap();

    console_log!("pp loaded from string");

    console_log!(
        "Number of constraints per step (primary circuit): {}",
        pp.num_constraints().0
    );

    console_log!("Creating a RecursiveSNARK...");
    let recursive_snark = create_recursive_circuit(
        witness_generator_wasm,
        r1cs,
        private_inputs,
        start_public_input.clone(),
        &pp,
    )
    .await
    .unwrap();

    let z0_secondary = [F::<E2>::zero()];

    // verify the recursive SNARK
    console_log!("Verifying a RecursiveSNARK...");
    let res = recursive_snark.verify(&pp, 5, &start_public_input, &z0_secondary);
    assert!(res.is_ok());

    // produce a compressed SNARK
    console_log!("Generating a CompressedSNARK using Spartan with IPA-PC...");
    let (pk, _vk) = CompressedSNARK::<_, _, _, _, S1, S2>::setup(&pp).unwrap();
    let res = CompressedSNARK::<_, _, _, _, S1, S2>::prove(&pp, &pk, &recursive_snark);
    assert!(res.is_ok());
    let compressed_snark = res.unwrap();
    return serde_json::to_string(&compressed_snark).unwrap();
}

#[wasm_bindgen]
pub async fn verify_compressed_proof(
    pp_str: String,
    proof_str: String,
    start_json_str: &str,
) -> bool {
    console_log!("verifying");
    let pp = serde_json::from_str::<
        PublicParams<
            E1,
            E2,
            CircomCircuit<<E1 as Engine>::Scalar>,
            TrivialCircuit<<E2 as Engine>::Scalar>,
        >,
    >(&pp_str)
    .unwrap();
    console_log!("pp loaded from string");
    let (_pk, vk) = CompressedSNARK::<_, _, _, _, S1, S2>::setup(&pp).unwrap();
    let start_public_input = read_start_input(start_json_str);
    let z0_secondary = vec![F::<E2>::zero()];

    let compressed_proof = serde_json::from_str::<
        CompressedSNARK<
            E1,
            E2,
            CircomCircuit<<E1 as Engine>::Scalar>,
            TrivialCircuit<<E2 as Engine>::Scalar>,
            S1,
            S2,
        >,
    >(&proof_str)
    .unwrap();
    console_log!("proof loaded from string");
    let res = compressed_proof.verify(&vk, 5, &start_public_input, &z0_secondary);
    let status = res.is_ok();
    console_log!("A-> {:?}", res.unwrap().0[0]);
    return status;
}
