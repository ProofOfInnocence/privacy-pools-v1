// const { createHelia } = require('helia')
// const { strings } = require('@helia/strings')

// const IPFS = require('ipfs')
const ipfsHttpClient = require('ipfs-http-client')
const fs = require('fs')

async function main() {
  //   const helia = await IPFS.create()
  // const node = await IPFS.create()
  const node = await ipfsHttpClient.create()

  let fileCID
  // Initialize the IPFS node
  try {
    // Read the file you want to upload
    const fileContent = fs.readFileSync('./membership-proof/test/inputs.json')
    console.log('----> fileContent', fileContent)
    // Add the file to IPFS
    const addedFile = await node.add({ entry: fileContent })

    // Get the CID (Content Identifier) of the uploaded file
    fileCID = addedFile.cid.toString()

    console.log('File uploaded to IPFS with CID:', fileCID)
  } catch (error) {
    console.error('Error uploading file to IPFS:', error)
  }
  console.log('node: ', node)
  node.stop()
  // return fileCID
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
