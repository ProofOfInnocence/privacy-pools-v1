use std::{collections::HashMap, env::current_dir, time::Instant};

use nova_scotia::{
    circom::reader::load_r1cs, create_public_params,
    create_recursive_circuit, FileLocation, F, S,
};
use nova_snark::{provider, CompressedSNARK, PublicParams};

use std::fs::File;
use std::path::PathBuf;
use std::io::BufReader;
use serde::de::DeserializeOwned;
use serde_json::Value;
use serde_json;

type G1 = provider::bn256_grumpkin::bn256::Point;
type G2 = provider::bn256_grumpkin::grumpkin::Point;

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

pub fn json_to_obj<T: DeserializeOwned>(file_path: PathBuf) -> T {
    println!("file = {:?}", file_path);
    let file = File::open(file_path).expect("error");
    let reader = BufReader::new(file);
    let a: T = serde_json::from_reader(reader).expect("error");
    return a;
}

fn read_circuit_inputs(input_path: PathBuf) -> Vec<HashMap<String, Value>> {
    let input: Value = json_to_obj(input_path);
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

fn read_start_input(start_path: PathBuf) -> Vec<F::<G1>> {
    let start_input: Value = json_to_obj(start_path);
    let a = start_input.as_object().unwrap().get("step_in").unwrap().as_array().unwrap();
    let mut input_vector = Vec::new();
    for value in a {
        let x = value.as_str().unwrap();
        input_vector.push(F::<G1>::from_raw(hexstr_to_4u64(x.to_string())))
    }
    return input_vector;
}

fn run_test(circuit_filepath: String, witness_gen_filepath: String) {
    println!(
        "Running test with witness generator: {} and group: {}",
        witness_gen_filepath,
        std::any::type_name::<G1>()
    );
    let root = current_dir().unwrap();

    let circuit_file = root.join(circuit_filepath);
    let r1cs = load_r1cs::<G1, G2>(&FileLocation::PathBuf(circuit_file));
    let witness_generator_file = root.join(witness_gen_filepath);

    let private_inputs = read_circuit_inputs(PathBuf::from("output/inputs.json"));
    let start_public_input = read_start_input(PathBuf::from("output/start.json"));

    let pp: PublicParams<G1, G2, _, _> = create_public_params(r1cs.clone());

    println!(
        "Number of constraints per step (primary circuit): {}",
        pp.num_constraints().0
    );
    println!(
        "Number of constraints per step (secondary circuit): {}",
        pp.num_constraints().1
    );

    println!(
        "Number of variables per step (primary circuit): {}",
        pp.num_variables().0
    );
    println!(
        "Number of variables per step (secondary circuit): {}",
        pp.num_variables().1
    );

    println!("Creating a RecursiveSNARK...");
    let start = Instant::now();
    let recursive_snark = create_recursive_circuit(
        FileLocation::PathBuf(witness_generator_file.clone()),
        r1cs.clone(),
        private_inputs,
        start_public_input.clone(),
        &pp,
    )
    .unwrap();
    println!("RecursiveSNARK creation took {:?}", start.elapsed());

    // TODO: empty?
    let z0_secondary = [F::<G2>::from(0)];

    // verify the recursive SNARK
    println!("Verifying a RecursiveSNARK...");
    let start = Instant::now();
    let res = recursive_snark.verify(&pp, 1, &start_public_input, &z0_secondary);
    println!(
        "RecursiveSNARK::verify: {:?}, took {:?}",
        res,
        start.elapsed()
    );
    assert!(res.is_ok());

    //assert_eq!(z_last[0], F::<G1>::from(20));
    //assert_eq!(z_last[1], F::<G1>::from(70));

    // produce a compressed SNARK
    println!("Generating a CompressedSNARK using Spartan with IPA-PC...");
    let start = Instant::now();
    let (pk, vk) = CompressedSNARK::<_, _, _, _, S<G1>, S<G2>>::setup(&pp).unwrap();
    let res = CompressedSNARK::<_, _, _, _, S<G1>, S<G2>>::prove(&pp, &pk, &recursive_snark);
    println!(
        "CompressedSNARK::prove: {:?}, took {:?}",
        res.is_ok(),
        start.elapsed()
    );
    assert!(res.is_ok());
    let compressed_snark = res.unwrap();

    // verify the compressed SNARK
    println!("Verifying a CompressedSNARK...");
    let start = Instant::now();
    let res = compressed_snark.verify(
        &vk,
        1,
        start_public_input.to_vec(),
        z0_secondary.to_vec(),
    );
    println!(
        "CompressedSNARK::verify: {:?}, took {:?}",
        res.is_ok(),
        start.elapsed()
    );
    assert!(res.is_ok());
}

fn main() {
    let circuit_filepath = format!("output/proofOfInnocence.r1cs");
    let witness_gen_filepath = format!("output/proofOfInnocence_js/proofOfInnocence.wasm");
    run_test(circuit_filepath.clone(), witness_gen_filepath);
}