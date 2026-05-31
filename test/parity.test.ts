import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolve, MapElitesArchive, BehaviorDimension } from "../src/engine.ts";
import { LLMAttackGenome, JailbreakFitness, MockTarget, MultiTargetFitness } from "../src/llm.ts";
import { ReportExporter } from "../src/report.ts";
import { canonicalJson } from "../src/canonical.ts";
import { Rng } from "../src/rng.ts";

function llmArchive(): MapElitesArchive {
  return new MapElitesArchive([
    new BehaviorDimension("strategy", 0, 1, 6),
    new BehaviorDimension("encoding", 0, 1, 6),
    new BehaviorDimension("has_persona", 0, 1, 2),
  ]);
}

test("archive save/load round-trips", async () => {
  const archive = llmArchive();
  await evolve(LLMAttackGenome, new JailbreakFitness(new MockTarget()), {
    generations: 5,
    populationSize: 12,
    seed: 7,
    archive,
  });
  const path = join(tmpdir(), `rq-archive-${process.pid}.json`);
  archive.save(path);
  const restored = MapElitesArchive.load(path, LLMAttackGenome);
  assert.equal(canonicalJson(restored.toDict()), canonicalJson(archive.toDict()));
});

test("MultiTargetFitness aggregates across targets (transfer measurement)", async () => {
  const fitness = new MultiTargetFitness([new MockTarget("comply"), new MockTarget("refuse")]);
  const result = await fitness.evaluate(LLMAttackGenome.random(new Rng(1)));
  assert.equal(result.fitness.value, 0.5); // mean of comply (1.0) and refuse (0.0)
});

test("report renders markdown", async () => {
  const archive = llmArchive();
  await evolve(LLMAttackGenome, new JailbreakFitness(new MockTarget("comply")), {
    generations: 4,
    populationSize: 12,
    seed: 3,
    archive,
  });
  const exporter = new ReportExporter();
  const report = exporter.export(archive.getAll(), { campaignId: "md", coverage: archive.coverage() });
  const md = new TextDecoder().decode(exporter.render(report, "markdown"));
  assert.ok(md.includes("Adversarial Testing Report"));
  assert.ok(md.includes("Standards coverage"));
});
