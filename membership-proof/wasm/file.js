export async function read_filex(path) {
    //return (await fetch(`http://localhost:3131/${path}`)).text();
    console.log("from js x, ");
    console.log(path);
    return (await fetch(path)).text();
}

export async function read_file_binary(path) {
    console.log("from js b, ");
    console.log(path);
    let result = await fetch(path);
    console.log("[js] result done");
    let ab = await result.arrayBuffer();
    console.log("[js] array buffer done");
    let uia = new Uint8Array(ab);
    console.log("[js] uia done");
    return uia;
}
