const fs = require('fs');
const path = require('path');

const srcWasm = path.resolve(__dirname, 'src', 'ecash_lib_wasm_bg_nodejs.wasm');
const outWasm = path.resolve(__dirname, 'out', 'ecash_lib_wasm_bg_nodejs.wasm');

if (fs.existsSync(srcWasm)) {
  fs.copyFileSync(srcWasm, outWasm);
  console.log('WASM file copied to out/.');
} else {
  console.warn('WASM file not found in src/.');
}
