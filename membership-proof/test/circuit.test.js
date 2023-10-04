const filePath = "./input.json";
const testVector = require(filePath);

const tester = require("circom_tester").wasm;

describe("Proof of Innocence", async () => {
  it("Should test POI circuit with mock inputs", async () => {
    const circuit = await tester("./circuits/proofOfInnocence.circom", {
      reduceConstraints: false,
    });
      const inputs = testVector;
      const witness = await circuit.calculateWitness(inputs);
      await circuit.checkConstraints(witness);
    //   const output = await circuit.getDecoratedOutput(witness);
      // console.log("output", i);
      // console.log(output);
  });
});