import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalJson } from "../src/canonical.ts";
import {
  runL1,
  runL2,
  runL3,
  runL4MultiTurn,
  runL4Agentic,
  CONFORMANCE_SEED,
} from "../src/conformance.ts";

test("L1 engine determinism reproduces the Python golden byte-for-byte", async () => {
  const golden = readFileSync(new URL("./fixtures/L1.json", import.meta.url), "utf8");
  const produced = canonicalJson(await runL1(CONFORMANCE_SEED)) + "\n";
  assert.equal(produced, golden);
});

test("L2 LLM-domain determinism reproduces the Python golden byte-for-byte", async () => {
  const golden = readFileSync(new URL("./fixtures/L2.json", import.meta.url), "utf8");
  const produced = canonicalJson(await runL2(CONFORMANCE_SEED)) + "\n";
  assert.equal(produced, golden);
});

test("L3 compliance report reproduces the Python golden byte-for-byte", async () => {
  const golden = readFileSync(new URL("./fixtures/L3.json", import.meta.url), "utf8");
  const produced = canonicalJson(await runL3(CONFORMANCE_SEED)) + "\n";
  assert.equal(produced, golden);
});

test("L4 multi-turn determinism reproduces the Python golden byte-for-byte", async () => {
  const golden = readFileSync(new URL("./fixtures/L4_multiturn.json", import.meta.url), "utf8");
  const produced = canonicalJson(await runL4MultiTurn(CONFORMANCE_SEED)) + "\n";
  assert.equal(produced, golden);
});

test("L4 agentic determinism reproduces the Python golden byte-for-byte", async () => {
  const golden = readFileSync(new URL("./fixtures/L4_agentic.json", import.meta.url), "utf8");
  const produced = canonicalJson(await runL4Agentic(CONFORMANCE_SEED)) + "\n";
  assert.equal(produced, golden);
});

test("L1 is reproducible within a run", async () => {
  assert.equal(canonicalJson(await runL1(1234)), canonicalJson(await runL1(1234)));
});
