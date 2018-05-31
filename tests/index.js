import WAForth from "../src/shell/WAForth";
import { mocha } from "mocha";
import { expect } from "chai";
mocha.setup("bdd");

describe("WAForth", () => {
  let forth, stack, output, core, memory, memory8;

  beforeEach(() => {
    forth = new WAForth();
    forth.onEmit = c => {
      output = output + String.fromCharCode(c);
    };
    const x = forth.start({ skipPrelude: true }).then(
      () => {
        core = forth.core.exports;

        output = "";
        memory = new Int32Array(core.memory.buffer, 0, 0x30000);
        memory8 = new Uint8Array(core.memory.buffer, 0, 0x30000);
        // dictionary = new Uint8Array(core.memory.buffer, 0x1000, 0x1000);
        stack = new Int32Array(core.memory.buffer, core.tos.value, 0x100);
      },
      err => {
        console.error(err);
      }
    );
    return x;
  });

  // eslint-disable-next-line no-unused-vars
  function dumpTable() {
    for (let i = 0; i < core.table.length; ++i) {
      console.log("table", i, core.table.get(i));
    }
  }

  function getString(p, n) {
    let name = [];
    for (let i = 0; i < n; ++i) {
      name.push(String.fromCharCode(memory8[p + i]));
    }
    return name.join("");
  }

  function getCountedString(p) {
    return getString(p + 4, memory[p / 4]);
  }

  // eslint-disable-next-line no-unused-vars
  function dumpWord(w) {
    let end = here();
    let p = latest();
    while (p != w) {
      console.log("SEARCH", p, w);
      end = p;
      p = memory[p / 4];
    }
    const previous = memory[p / 4];
    const length = memory8[p + 4];
    const name = getString(p + 4 + 1, length);
    const codeP = (p + 4 + 1 + length + 3) & ~3;
    const code = memory[codeP / 4];
    const data = [];
    for (let i = codeP + 4; i < end; ++i) {
      data.push(memory8[i]);
    }
    console.log("Entry:", p, previous, length, name, code, data, end);
  }

  function run(s) {
    const r = forth.run(s);
    expect(r).to.not.be.below(0);
    output = output.substr(0, output.length - 3); // Strip 'ok\n' from output
    return r;
  }

  function here() {
    run("HERE");
    const result = memory[core.tos.value / 4 - 1];
    run("DROP");
    return result;
  }

  function latest() {
    run("LATEST");
    const result = memory[core.tos.value / 4 - 1];
    run("DROP");
    return result;
  }

  describe("leb128", () => {
    it("should convert 0x0", () => {
      const r = core.leb128(0x0, 0x0);
      expect(r).to.eql(0x1);
      expect(memory8[0]).to.eql(0x0);
    });
    it("should convert 0x17", () => {
      const r = core.leb128(0x0, 0x17);
      expect(r).to.eql(0x1);
      expect(memory8[0]).to.eql(0x17);
    });
    it("should convert 0x80", () => {
      const r = core.leb128(0x0, 0x80);
      expect(r).to.eql(0x2);
      expect(memory8[0]).to.eql(0x80);
      expect(memory8[1]).to.eql(0x01);
    });
    it("should convert 0x12345", () => {
      const r = core.leb128(0x0, 0x12345);
      expect(r).to.eql(0x3);
      expect(memory8[0]).to.eql(0xc5);
      expect(memory8[1]).to.eql(0xc6);
      expect(memory8[2]).to.eql(0x04);
    });
    it("should convert -1", () => {
      const r = core.leb128(0x0, -1);
      expect(r).to.eql(0x1);
      expect(memory8[0]).to.eql(0x7f);
    });
    it("should convert -0x12345", () => {
      const r = core.leb128(0x0, -0x12345);
      expect(r).to.eql(0x3);
      expect(memory8[0]).to.eql(0xbb);
      expect(memory8[1]).to.eql(0xb9);
      expect(memory8[2]).to.eql(0x7b);
    });
  });

  describe("leb128-4p", () => {
    it("should convert 0x0", () => {
      expect(core.leb128_4p(0x0)).to.eql(0x808080);
    });
    it("should convert 0x17", () => {
      expect(core.leb128_4p(0x17)).to.eql(0x808097);
    });
    it("should convert 0x80", () => {
      expect(core.leb128_4p(0x80)).to.eql(0x808180);
    });
    it("should convert 0xBADF00D", () => {
      expect(core.leb128_4p(0xbadf00d)).to.eql(0x5db7e08d);
    });
    it("should convert 0xFFFFFFF", () => {
      expect(core.leb128_4p(0xfffffff)).to.eql(0x7fffffff);
    });
  });

  describe("interpret", () => {
    it("should return an error when word is not found", () => {
      forth.read("BADWORD");
      expect(core.interpret()).to.eql(-1);
    });

    it("should interpret a positive number", () => {
      forth.read("123");
      expect(core.interpret()).to.eql(0);
      expect(stack[0]).to.eql(123);
    });

    it("should interpret a negative number", () => {
      forth.read("-123");
      expect(core.interpret()).to.eql(0);
      expect(stack[0]).to.eql(-123);
    });

    it("should fail on half a word", () => {
      forth.read("23FOO");
      expect(core.interpret()).to.eql(-1);
    });
  });

  describe("DUP", () => {
    it("should work", () => {
      run("121");
      run("DUP");
      expect(stack[0]).to.eql(121);
      expect(stack[1]).to.eql(121);
    });
  });

  describe("?DUP", () => {
    it("should duplicate when not 0", () => {
      run("121");
      run("?DUP 5");
      expect(stack[0]).to.eql(121);
      expect(stack[1]).to.eql(121);
      expect(stack[2]).to.eql(5);
    });

    it("should not duplicate when 0", () => {
      run("0");
      run("?DUP 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("2DUP", () => {
    it("should work", () => {
      run("222");
      run("173");
      run("2DUP");
      run("5");
      expect(stack[0]).to.eql(222);
      expect(stack[1]).to.eql(173);
      expect(stack[2]).to.eql(222);
      expect(stack[3]).to.eql(173);
      expect(stack[4]).to.eql(5);
    });
  });

  describe("ROT", () => {
    it("should work", () => {
      run("1 2 3 ROT 5");
      expect(stack[0]).to.eql(2);
      expect(stack[1]).to.eql(3);
      expect(stack[2]).to.eql(1);
      expect(stack[3]).to.eql(5);
    });
  });

  describe("*", () => {
    it("should multiply", () => {
      run("3");
      run("4");
      run("*");
      run("5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(5);
    });

    it("should multiply negative", () => {
      run("-3");
      run("4");
      run("*");
      run("5");
      expect(stack[0]).to.eql(-12);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("+", () => {
    it("should add", () => {
      run("3");
      run("4");
      run("+");
      run("5");
      expect(stack[0]).to.eql(7);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("-", () => {
    it("should subtract", () => {
      run("8 5 - 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(5);
    });

    it("should subtract to negative", () => {
      run("8 13 - 5");
      expect(stack[0]).to.eql(-5);
      expect(stack[1]).to.eql(5);
    });

    it("should subtract negative", () => {
      run("8 -3 - 5");
      expect(stack[0]).to.eql(11);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("/", () => {
    it("should divide", () => {
      run("15 5 / 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(5);
    });

    it("should divide negative", () => {
      run("15 -5 / 5");
      expect(stack[0]).to.eql(-3);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("/MOD", () => {
    it("should work", () => {
      run("15 6 /MOD 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(2);
      expect(stack[2]).to.eql(5);
    });
  });

  describe("1+", () => {
    it("should work with positive numbers", () => {
      run("3");
      run("1+");
      run("5");
      expect(stack[0]).to.eql(4);
      expect(stack[1]).to.eql(5);
    });

    it("should work with negative numbers", () => {
      run("-3");
      run("1+");
      run("5");
      expect(stack[0]).to.eql(-2);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("1-", () => {
    it("should work with positive numbers", () => {
      run("3");
      run("1-");
      run("5");
      expect(stack[0]).to.eql(2);
      expect(stack[1]).to.eql(5);
    });

    it("should work with negative numbers", () => {
      run("-3");
      run("1-");
      run("5");
      expect(stack[0]).to.eql(-4);
      expect(stack[1]).to.eql(5);
    });
  });

  describe(">", () => {
    it("should test true when greater", () => {
      run("5");
      run("3");
      run(">");
      run("5");
      expect(stack[0]).to.eql(-1);
      expect(stack[1]).to.eql(5);
    });

    it("should test false when smaller", () => {
      run("3");
      run("5");
      run(">");
      run("5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });

    it("should test false when equal", () => {
      run("5");
      run("5");
      run(">");
      run("5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });

    it("should work with negative numbers", () => {
      run("5");
      run("-3");
      run(">");
      run("5");
      expect(stack[0]).to.eql(-1);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("NEGATE", () => {
    it("should negate positive number", () => {
      run("7 NEGATE 5");
      expect(stack[0]).to.eql(-7);
      expect(stack[1]).to.eql(5);
    });

    it("should negate negative number", () => {
      run("-7 NEGATE 5");
      expect(stack[0]).to.eql(7);
      expect(stack[1]).to.eql(5);
    });

    it("should negate negative zero", () => {
      run("0 NEGATE 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("0=", () => {
    it("should test true", () => {
      run("0");
      run("0=");
      run("5");
      expect(stack[0]).to.eql(-1);
      expect(stack[1]).to.eql(5);
    });

    it("should test false", () => {
      run("23");
      run("0=");
      run("5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("0>", () => {
    it("should test true", () => {
      run("2");
      run("0>");
      run("5");
      expect(stack[0]).to.eql(-1);
      expect(stack[1]).to.eql(5);
    });

    it("should test false", () => {
      run("-3");
      run("0>");
      run("5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("OVER", () => {
    it("should work", () => {
      run("12");
      run("34");
      run("OVER");
      run("5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(34);
      expect(stack[2]).to.eql(12);
      expect(stack[3]).to.eql(5);
    });
  });

  describe("SWAP", () => {
    it("should work", () => {
      run("12");
      run("34");
      run("SWAP");
      run("5");
      expect(stack[0]).to.eql(34);
      expect(stack[1]).to.eql(12);
      expect(stack[2]).to.eql(5);
    });
  });

  describe("EMIT", () => {
    it("should work once", () => {
      run("87");
      run("EMIT");
      expect(output).to.eql("W");
    });

    it("should work twice", () => {
      run("97");
      run("87");
      run("EMIT");
      run("EMIT");
      expect(output).to.eql("Wa");
    });
  });

  describe("DROP", () => {
    it("should drop", () => {
      run("222");
      run("173");
      run("DROP");
      run("190");
      expect(stack[0]).to.eql(222);
      expect(stack[1]).to.eql(190);
    });
  });

  describe("ERASE", () => {
    it("should erase", () => {
      const ptr = here();
      memory8[ptr] = 222;
      memory8[ptr + 1] = 173;
      memory8[ptr + 2] = 190;
      memory8[ptr + 3] = 239;
      run((ptr + 1).toString(10));
      run("2 ERASE 5");

      expect(memory8[ptr + 0]).to.eql(222);
      expect(memory8[ptr + 1]).to.eql(0x00);
      expect(memory8[ptr + 2]).to.eql(0x00);
      expect(memory8[ptr + 3]).to.eql(239);
      expect(stack[0]).to.eql(5);
    });
  });

  describe("IF/ELSE/THEN", () => {
    it("should take the then branch without else", () => {
      run(`: FOO IF 8 THEN ;`);
      run("1 FOO 5");
      expect(stack[0]).to.eql(8);
      expect(stack[1]).to.eql(5);
    });

    it("should not take the then branch without else", () => {
      run(": FOO");
      run("IF");
      run("8");
      run("THEN");
      run("0");
      run(";");
      run("FOO");
      run("5");
      expect(stack[0]).to.eql(5);
    });

    it("should take the then branch with else", () => {
      run(": FOO");
      run("IF");
      run("8");
      run("ELSE");
      run("9");
      run("THEN");
      run(";");
      run("1");
      run("FOO");
      run("5");
      expect(stack[0]).to.eql(8);
      expect(stack[1]).to.eql(5);
    });

    it("should take the else branch with else", () => {
      run(": FOO");
      run("IF");
      run("8");
      run("ELSE");
      run("9");
      run("THEN");
      run(";");
      run("0");
      run("FOO");
      run("5");
      expect(stack[0]).to.eql(9);
      expect(stack[1]).to.eql(5);
    });

    it("should support nested if", () => {
      run(`: FOO
              IF
                IF 8 ELSE 9 THEN
                10
              ELSE
                11
              THEN
              ;`);
      run("0 1 FOO 5");
      expect(stack[0]).to.eql(9);
      expect(stack[1]).to.eql(10);
      expect(stack[2]).to.eql(5);
    });
  });

  describe("DO/LOOP", () => {
    it("should run a loop", () => {
      run(`: FOO 4 0 DO 3 LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(3);
      expect(stack[2]).to.eql(3);
      expect(stack[3]).to.eql(3);
      expect(stack[4]).to.eql(5);
    });

    it("should run a nested loop", () => {
      run(`: FOO 3 0 DO 2 0 DO 3 LOOP LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(3);
      expect(stack[2]).to.eql(3);
      expect(stack[3]).to.eql(3);
      expect(stack[4]).to.eql(3);
      expect(stack[5]).to.eql(3);
      expect(stack[6]).to.eql(5);
    });
  });

  describe("+LOOP", () => {
    it("should increment a loop", () => {
      run(`: FOO 10 0 DO 3 2 +LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(3);
      expect(stack[2]).to.eql(3);
      expect(stack[3]).to.eql(3);
      expect(stack[4]).to.eql(3);
      expect(stack[5]).to.eql(5);
    });

    it("should increment a loop beyond the index", () => {
      run(`: FOO 10 0 DO 3 8 +LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(3);
      expect(stack[2]).to.eql(5);
    });
  });

  describe("I", () => {
    it("should work", () => {
      run(`: FOO 4 0 DO I LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(1);
      expect(stack[2]).to.eql(2);
      expect(stack[3]).to.eql(3);
      expect(stack[4]).to.eql(5);
    });

    it("should work in a nested loop", () => {
      run(`: FOO 3 0 DO 2 0 DO I LOOP LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(1);
      expect(stack[2]).to.eql(0);
      expect(stack[3]).to.eql(1);
      expect(stack[4]).to.eql(0);
      expect(stack[5]).to.eql(1);
      expect(stack[6]).to.eql(5);
    });
  });

  describe("J", () => {
    it("should work", () => {
      run(`: FOO 3 0 DO 2 0 DO J LOOP LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(0);
      expect(stack[2]).to.eql(1);
      expect(stack[3]).to.eql(1);
      expect(stack[4]).to.eql(2);
      expect(stack[5]).to.eql(2);
      expect(stack[6]).to.eql(5);
    });

    it("should work in a nested loop", () => {
      run(`: FOO 3 0 DO 2 0 DO J LOOP LOOP ;`);
      run("FOO 5");
      expect(stack[0]).to.eql(0);
      expect(stack[1]).to.eql(0);
      expect(stack[2]).to.eql(1);
      expect(stack[3]).to.eql(1);
      expect(stack[4]).to.eql(2);
      expect(stack[5]).to.eql(2);
      expect(stack[6]).to.eql(5);
    });
  });

  describe("BEGIN / WHILE / REPEAT", () => {
    it("should work", () => {
      run(`: FOO BEGIN DUP 2 * DUP 16 < WHILE DUP REPEAT 7 ;`);
      run("1 FOO 5");
      expect(stack[0]).to.eql(1);
      expect(stack[1]).to.eql(2);
      expect(stack[2]).to.eql(2);
      expect(stack[3]).to.eql(4);
      expect(stack[4]).to.eql(4);
      expect(stack[5]).to.eql(8);
      expect(stack[6]).to.eql(8);
      expect(stack[7]).to.eql(16);
      expect(stack[8]).to.eql(7);
      expect(stack[9]).to.eql(5);
    });
  });

  describe("CHAR", () => {
    it("should work with a single character", () => {
      run("CHAR A 5");
      expect(stack[0]).to.eql(65);
      expect(stack[1]).to.eql(5);
    });

    it("should work with multiple characters", () => {
      run("CHAR ABC 5");
      expect(stack[0]).to.eql(65);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("word", () => {
    it("should read a word", () => {
      forth.read(" FOO BAR BAZ ");
      core.WORD();
      expect(getCountedString(stack[0])).to.eql("FOO");
    });

    it("should read two words", () => {
      forth.read(" FOO BAR BAZ ");
      core.WORD();
      core.WORD();
      expect(getCountedString(stack[1])).to.eql("BAR");
    });

    it("should skip comments", () => {
      forth.read("  \\ FOO BAZ\n BART BAZ");
      core.WORD();
      expect(getCountedString(stack[0])).to.eql("BART");
    });

    it("should stop at end of buffer while parsing word", () => {
      forth.read("FOO");
      core.WORD();
      expect(getCountedString(stack[0])).to.eql("FOO");
    });

    it("should stop at end of buffer while parsing comments", () => {
      forth.read(" \\FOO");
      core.WORD();
      expect(getCountedString()).to.eql("");
    });

    it("should stop when parsing empty line", () => {
      forth.read(" ");
      core.WORD();
      expect(getCountedString()).to.eql("");
    });

    it("should stop when parsing nothing", () => {
      forth.read("");
      core.WORD();
      expect(getCountedString()).to.eql("");
    });
  });

  describe("FIND", () => {
    it("should find a word", () => {
      forth.read("DUP");
      core.WORD();
      core.FIND();
      expect(stack[0]).to.eql(131524);
      expect(stack[1]).to.eql(-1);
    });

    it("should find a short word", () => {
      forth.read("!");
      core.WORD();
      core.FIND();
      expect(stack[0]).to.eql(131072);
      expect(stack[1]).to.eql(-1);
    });

    it("should find an immediate word", () => {
      forth.read("+LOOP");
      core.WORD();
      core.FIND();
      expect(stack[0]).to.eql(131108);
      expect(stack[1]).to.eql(1);
    });

    it("should not find an unexisting word", () => {
      forth.read("BADWORD");
      core.WORD();
      core.FIND();
      expect(stack[1]).to.eql(0);
    });

    it("should not find a very long unexisting word", () => {
      forth.read("VERYVERYVERYBADWORD");
      core.WORD();
      core.FIND();
      expect(stack[1]).to.eql(0);
    });
  });

  describe("BASE", () => {
    it("should contain the base", () => {
      run("BASE @ 5");
      expect(stack[0]).to.eql(10);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("KEY", () => {
    it("should read a key", () => {
      run("KEY F");
      run("5");
      expect(stack[0]).to.eql(70);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("LITERAL", () => {
    it("should put a literal on the stack", () => {
      run("20 : FOO LITERAL ;");
      run("5 FOO");
      expect(stack[0]).to.eql(5);
      expect(stack[1]).to.eql(20);
    });
  });

  describe("[ ]", () => {
    it("should work", () => {
      run(": FOO [ 20 5 * ] LITERAL ;");
      run("5 FOO 6");
      expect(stack[0]).to.eql(5);
      expect(stack[1]).to.eql(100);
      expect(stack[2]).to.eql(6);
    });
  });

  describe("C@", () => {
    it("should fetch an aligned character", () => {
      const ptr = here();
      memory8[ptr] = 222;
      memory8[ptr + 1] = 173;
      run(ptr.toString());
      run("C@");
      expect(stack[0]).to.eql(222);
    });

    it("should fetch an unaligned character", () => {
      const ptr = here();
      memory8[ptr] = 222;
      memory8[ptr + 1] = 173;
      run((ptr + 1).toString());
      run("C@");
      expect(stack[0]).to.eql(173);
    });
  });

  describe("C!", () => {
    it("should store an aligned character", () => {
      const ptr = here();
      memory8[ptr] = 222;
      memory8[ptr + 1] = 173;
      run("190");
      run(ptr.toString());
      run("C! 5");
      expect(stack[0]).to.eql(5);
      expect(memory8[ptr]).to.eql(190);
      expect(memory8[ptr + 1]).to.eql(173);
    });

    it("should store an unaligned character", () => {
      const ptr = here();
      memory8[ptr] = 222;
      memory8[ptr + 1] = 173;
      run("190");
      run((ptr + 1).toString());
      run("C! 5");
      expect(stack[0]).to.eql(5);
      expect(memory8[ptr]).to.eql(222);
      expect(memory8[ptr + 1]).to.eql(190);
    });
  });

  describe("@", () => {
    it("should fetch", () => {
      const ptr = here();
      memory[ptr / 4] = 123456;
      run(ptr.toString());
      run("@ 5");
      expect(stack[0]).to.eql(123456);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("!", () => {
    it("should store", () => {
      const ptr = here();
      run("12345");
      run(ptr.toString());
      run("! 5");
      expect(stack[0]).to.eql(5);
      expect(memory[ptr / 4]).to.eql(12345);
    });
  });

  describe(",", () => {
    it("should add word", () => {
      run("HERE");
      run("1234");
      run(",");
      run("HERE");
      expect(stack[1] - stack[0]).to.eql(4);
      expect(memory[stack[0] / 4]).to.eql(1234);
    });
  });

  describe('S"', () => {
    it("should work", () => {
      run(': FOO S" Foo Bar" ;');
      run("FOO");
      expect(stack[1]).to.eql(7);
      expect(getString(stack[0], stack[1])).to.eql("Foo Bar");
    });

    it("should work with 2 strings", () => {
      run(': FOO S" Foo Bar" ;');
      run(': BAR S" Baz Ba" ;');
      run("FOO BAR 5");
      expect(stack[1]).to.eql(7);
      expect(getString(stack[0], stack[1])).to.eql("Foo Bar");
      expect(stack[3]).to.eql(6);
      expect(getString(stack[2], stack[3])).to.eql("Baz Ba");
    });
  });

  describe('."', () => {
    it("should work", () => {
      run(': FOO ." Foo Bar" ;');
      run("FOO 5");
      expect(stack[0]).to.eql(5);
      expect(output).to.eql("Foo Bar");
    });
  });

  describe("RECURSE", () => {
    it("should recurse", () => {
      run(": FOO DUP 4 < IF DUP 1+ RECURSE ELSE 12 THEN 13 ;");
      run("1 FOO 5");
      expect(stack[0]).to.eql(1);
      expect(stack[1]).to.eql(2);
      expect(stack[2]).to.eql(3);
      expect(stack[3]).to.eql(4);
      expect(stack[4]).to.eql(12);
      expect(stack[5]).to.eql(13);
      expect(stack[6]).to.eql(13);
      expect(stack[7]).to.eql(13);
      expect(stack[8]).to.eql(13);
      expect(stack[9]).to.eql(5);
    });
  });

  describe("CREATE", () => {
    it("should create words", () => {
      run("HERE");
      run("LATEST");
      run("CREATE DUP");
      run("HERE");
      run("LATEST");
      expect(stack[2] - stack[0]).to.eql(4 + 4 + 4);
      expect(stack[3]).to.eql(stack[0]);
      expect(stack[3]).to.not.eql(stack[1]);
    });

    it("should create findable words", () => {
      run("CREATE FOOBAR");
      run("LATEST");
      run("CREATE BAM");

      forth.read("FOOBAR");
      core.WORD();
      core.FIND();
      expect(stack[1]).to.eql(stack[0]);
      expect(stack[2]).to.eql(-1);
    });

    it("should align unaligned words", () => {
      run("CREATE DUPE");
      run("HERE");
      expect(stack[0] % 4).to.eql(0);
    });

    it("should align aligned words", () => {
      run("CREATE DUP");
      run("HERE");
      expect(stack[0] % 4).to.eql(0);
    });
  });

  describe("IMMEDIATE", () => {
    it("should make words immediate", () => {
      run("CREATE FOOBAR IMMEDIATE");
      forth.read("FOOBAR");
      core.WORD();
      core.FIND();

      expect(stack[1]).to.eql(1);
    });
  });

  describe(":", () => {
    it("should compile multiple instructions", () => {
      run(": FOOBAR 4 * ;");
      run("3 FOOBAR");
      expect(stack[0]).to.eql(12);
    });

    it("should compile negative numbers", () => {
      run(": FOOBAR -4 * ;");
      run("3 FOOBAR");
      expect(stack[0]).to.eql(-12);
    });

    it("should compile large numbers", () => {
      run(": FOOBAR 111111 * ;");
      run("3 FOOBAR");
      expect(stack[0]).to.eql(333333);
    });

    it("should skip comments", () => {
      run(": FOOBAR\n\n    \\ Test string  \n  4 * ;");
      run("3 FOOBAR 5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(5);
    });

    it("should override", () => {
      run(": FOOBAR 3 ;");
      run(": FOOBAR FOOBAR 4 ;");
      run("FOOBAR 5");
      expect(stack[0]).to.eql(3);
      expect(stack[1]).to.eql(4);
      expect(stack[2]).to.eql(5);
    });

    it("should compile a name with an illegal WASM character", () => {
      run(': F" 3 0 DO 2 LOOP ;');
    });
  });

  describe("VARIABLE", () => {
    it("should work with one variable", () => {
      run("VARIABLE FOO");
      run("12 FOO !");
      run("FOO @ 5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(5);
    });

    it("should work with two variables", () => {
      run("VARIABLE FOO VARIABLE BAR");
      run("12 FOO ! 13 BAR !");
      run("FOO @ BAR @ 5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(13);
      expect(stack[2]).to.eql(5);
    });
  });

  describe("CONSTANT", () => {
    it("should work", () => {
      run("12 CONSTANT FOO");
      run("FOO 5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(5);
    });
  });

  describe("VALUE", () => {
    it("should store a value", () => {
      run("12 VALUE FOO");
      run("FOO 5");
      expect(stack[0]).to.eql(12);
      expect(stack[1]).to.eql(5);
    });

    it("should update a value", () => {
      run("12 VALUE FOO");
      run("13 TO FOO");
      run("FOO 5");
      expect(stack[0]).to.eql(13);
      expect(stack[1]).to.eql(5);
    });
  });

  // describe.only("DOES>", () => {
  //   it("should work", () => {
  //     run(": ID CREATE 1 , DOES> @");
  //   });
  // });

  describe("UWIDTH", () => {
    beforeEach(() => {
      core.loadPrelude();
    });

    it("should work with 3 digits", () => {
      run("123 UWIDTH");
      expect(stack[0]).to.eql(3);
    });

    it("should work with 4 digits", () => {
      run("1234 UWIDTH");
      expect(stack[0]).to.eql(4);
    });
  });

  describe("system", () => {
    it.skip("should run sieve", () => {
      run(`
: prime? HERE + C@ 0= ;
: composite! HERE + 1 SWAP C! ;

: sieve
  HERE OVER ERASE
  2
  BEGIN
    2DUP DUP * >
  WHILE
    DUP prime? IF
      2DUP DUP * DO
        I composite!
      DUP +LOOP
    THEN
    1+
  REPEAT
  DROP
  ." Primes: " 2 DO I prime? IF I . THEN LOOP 
;`);
      run("10 sieve");
      expect(output).to.eql("");
    });
  });
});

// mocha.checkLeaks();
mocha.globals(["jQuery"]);
mocha.run();
