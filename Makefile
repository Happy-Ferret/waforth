WAT2WASM=wat2wasm
WAT2WASM_FLAGS=
ifeq ($(DEBUG),1)
WAT2WASM_FLAGS=--debug-names
endif
PARCEL=./node_modules/.bin/parcel

WASM_FILES=dist/waforth.wasm dist/sieve-vanilla.wasm

all: $(WASM_FILES)
	$(PARCEL) build src/shell/index.html

dev-server: $(WASM_FILES)
	$(PARCEL) src/shell/index.html

.PHONY: tests
tests: $(WASM_FILES)
	$(PARCEL) --no-hmr -o dist/tests.html tests/index.html

.PHONY: sieve-vanilla
sieve-vanilla: $(WASM_FILES)
	$(PARCEL) --no-hmr -o dist/sieve-vanilla.html tests/benchmarks/sieve-vanilla/index.html

.PHONY: benchmark-sieve
benchmark-sieve: $(WASM_FILES)
	$(PARCEL) build -o dist/benchmark-sieve.html tests/benchmarks/sieve/index.html

.PHONY: benchmark-sieve-dev
benchmark-sieve-dev: $(WASM_FILES)
	$(PARCEL) --no-hmr tests/benchmarks/sieve/index.html

wasm: $(WASM_FILES) src/tools/quadruple.wasm.hex

dist/waforth.wasm: src/waforth.wat dist
	racket -f $< > src/waforth.wat.tmp
	$(WAT2WASM) $(WAT2WASM_FLAGS) -o $@ src/waforth.wat.tmp

dist/sieve-vanilla.wasm: tests/benchmarks/sieve-vanilla/sieve-vanilla.wat
	$(WAT2WASM) $(WAT2WASM_FLAGS) -o $@ $<

dist:
	mkdir -p $@

src/tools/quadruple.wasm: src/tools/quadruple.wat
	$(WAT2WASM) $(WAT2WASM_FLAGS) -o $@ $<

src/tools/quadruple.wasm.hex: src/tools/quadruple.wasm
	hexdump -v -e '16/1 "_u%04X" "\n"' $< | sed 's/_/\\/g; s/\\u    //g; s/.*/    "&"/' > $@

clean:
	-rm -rf $(WASM_FILES) src/tools/quadruple.wasm src/tools/quadruple.wasm.hex src/waforth.wat.tmp dist
