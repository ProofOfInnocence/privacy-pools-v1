use nova_scotia::{circom::reader::load_r1cs, create_public_params, FileLocation};
use nova_snark::{provider, PublicParams};
use std::fs::File;
use std::path::PathBuf;
use std::io::BufWriter;
// use serde_cbor;

type G1 = provider::bn256_grumpkin::bn256::Point;
type G2 = provider::bn256_grumpkin::grumpkin::Point;

fn generate_pp() {
    let r1cs = load_r1cs::<G1, G2>(&FileLocation::PathBuf(PathBuf::from("output/proofOfInnocence.r1cs")));
    let pp: PublicParams<G1, G2, _, _> = create_public_params(r1cs.clone());
    let file = File::create("output/proofOfInnocence.cbor").expect("error");
    let writer = BufWriter::new(file);
    serde_cbor::to_writer(writer, &pp).expect("write error");
}

fn main() {
    generate_pp();
}
