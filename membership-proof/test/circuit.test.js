const filePath = './inputs.json'
const testVectors = require(filePath)
const tester = require('circom_tester').wasm

describe('Proof of Innocence', async () => {
  await it('Should test POI circuit with mock inputs', async () => {
    const circuit = await tester('./circuits/proofOfInnocence.circom', {
      reduceConstraints: false,
    })
    for (let i = 0; i < testVectors.length; i++) {
      console.log('Checking constraints for input', i)
      const inputs = testVectors[i]
      const witness = await circuit.calculateWitness(inputs)
      await circuit.checkConstraints(witness)
      // const output = await circuit.getDecoratedOutput(witness)
      // console.log(output.slice(0, output.indexOf('\n')))
    }
  })
})
