import wasmModule from "../waforth.wasm";

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// eslint-disable-next-line no-unused-vars
function arrayToBase64(bytes) {
  var binary = "";
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

class WAForth {
  start(options = {}) {
    const { skipPrelude } = options;
    let table;
    let memory;
    const buffer = (this.buffer = []);

    return WebAssembly.instantiate(wasmModule, {
      shell: {
        ////////////////////////////////////////
        // I/O
        ////////////////////////////////////////

        emit: this.onEmit,

        key: () => {
          if (buffer.length === 0) {
            return -1;
          }
          return buffer.pop();
        },

        debug: d => {
          console.log("DEBUG: ", d);
        },

        ////////////////////////////////////////
        // Loader
        ////////////////////////////////////////

        load: (offset, length, index) => {
          let data = new Uint8Array(
            this.core.exports.memory.buffer,
            offset,
            length
          );
          if (isSafari) {
            // On Safari, using the original Uint8Array triggers a bug.
            // Taking an element-by-element copy of the data first.
            let dataCopy = [];
            for (let i = 0; i < length; ++i) {
              dataCopy.push(data[i]);
            }
            data = new Uint8Array(dataCopy);
          }
          if (index >= table.length) {
            table.grow(table.length); // Double size
          }
          // console.log("Load", index, new Uint8Array(data), arrayToBase64(data));
          var module = new WebAssembly.Module(data);
          new WebAssembly.Instance(module, {
            env: { table, tableBase: index, memory, tos: -1 }
          });
        }
      }
    }).then(instance => {
      this.core = instance.instance;
      table = this.core.exports.table;
      memory = this.core.exports.memory;
      if (!skipPrelude) {
        this.core.exports.loadPrelude();
      }
    });
  }

  read(s) {
    const data = new TextEncoder().encode(s);
    for (let i = data.length - 1; i >= 0; --i) {
      this.buffer.push(data[i]);
    }
  }

  run(s) {
    this.read(s);
    return this.core.exports.interpret();
  }
}

export default WAForth;
