import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Rng } from "../src/rng.ts";

const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/vectors.json", import.meta.url), "utf8"),
);
const MASK = (1n << 64n) - 1n;
const hx = (v: bigint): string => "0x" + (v & MASK).toString(16).padStart(16, "0");

test("seeding and u64 stream match the shared vectors", () => {
  for (const c of vectors.cases) {
    assert.deepEqual(new Rng(c.seed_decimal).state().map(hx), c.initial_state);
    const g = new Rng(c.seed_decimal);
    assert.deepEqual(
      Array.from({ length: 12 }, () => hx(g.nextU64())),
      c.next_u64,
    );
  }
});

test("double stream matches", () => {
  for (const c of vectors.cases) {
    const g = new Rng(c.seed_decimal);
    const got = Array.from({ length: 8 }, () => String(g.nextDouble()));
    assert.deepEqual(
      got,
      c.next_double.map((d: { value: string }) => d.value),
    );
  }
});

test("below(n) matches", () => {
  for (const bc of vectors.below_cases) {
    const g = new Rng(BigInt(bc.seed));
    assert.deepEqual(
      Array.from({ length: 10 }, () => g.below(bc.n)),
      bc.outputs,
    );
  }
});

test("shuffle matches", () => {
  for (const sc of vectors.shuffle_cases) {
    const g = new Rng(BigInt(sc.seed));
    const arr = [...sc.input];
    g.shuffle(arr);
    assert.deepEqual(arr, sc.output);
  }
});
