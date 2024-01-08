use nova_scotia::{
    circom::reader::load_r1cs, create_public_params, FileLocation
};
use nova_snark::{provider, PublicParams};

use std::fs::File;
use std::path::PathBuf;
use std::io::BufWriter;


use nova_snark::{
    provider::{mlkzg::Bn256EngineKZG, GrumpkinEngine}
};

type E1 = Bn256EngineKZG;
type E2 = GrumpkinEngine;
type EE1 = nova_snark::provider::mlkzg::EvaluationEngine<E1>;
type EE2 = nova_snark::provider::ipa_pc::EvaluationEngine<E2>;
type S1 = nova_snark::spartan::snark::RelaxedR1CSSNARK<E1, EE1>; // non-preprocessing SNARK
type S2 = nova_snark::spartan::snark::RelaxedR1CSSNARK<E2, EE2>; // non-preprocessing SNARK

pub fn get_cbor(circuit_filepath: String, cbor_filepath: String) {
    let circuit_file = PathBuf::from(circuit_filepath);
    let r1cs = load_r1cs::<E1, E2>(&FileLocation::PathBuf(circuit_file));

    let pp: PublicParams<E1, E2, _, _> = create_public_params::<E1, E2, S1, S2>(r1cs.clone());

    println!("writing to pp.cbor...");
    let file = File::create(cbor_filepath).expect("error");
    let writer = BufWriter::new(file);
    serde_cbor::to_writer(writer, &pp).expect("write error");

    println!("Number of constraints per step (primary circuit): {}", pp.num_constraints().0);
    println!("Number of constraints per step (secondary circuit): {}", pp.num_constraints().1);

    println!("Number of variables per step (primary circuit): {}", pp.num_variables().0);
    println!("Number of variables per step (secondary circuit): {}", pp.num_variables().1);
}


pub fn create_cbor() {
    println!("Hello, world!");
    get_cbor("../wasm-nova/output/proofOfInnocence.r1cs".to_string(), "../wasm-nova/output/proofOfInnocence.cbor".to_string());
}
