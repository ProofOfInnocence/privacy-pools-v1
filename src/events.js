async function getNullifierEvents({ tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewNullifier()
  return await tornadoPool.queryFilter(filter, 0)
}

async function getCommitmentEvents({ tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewCommitment()
  return await tornadoPool.queryFilter(filter, 0)
}

async function getTxRecordEvents({ tornadoPool }) {
  // TODO: Add theGraph
  const filter = tornadoPool.filters.NewTxRecord()
  return await tornadoPool.queryFilter(filter, 0)
}

module.exports = {
  getNullifierEvents,
  getCommitmentEvents,
  getTxRecordEvents,
}
