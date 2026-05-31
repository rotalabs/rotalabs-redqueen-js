/**
 * Conformance runners. Mirror `rotalabs_redqueen.conformance`; canonicalized
 * output must reproduce the shared golden fixtures byte-for-byte.
 *
 * L1 (engine determinism) is implemented here. L2/L3 (LLM domain + report)
 * land with the TypeScript LLM-domain port.
 */
import { coevolve, evolve, BehaviorDimension, MapElitesArchive } from "./engine.ts";
import {
  AgenticGenome,
  DefenderBlockFitness,
  HeuristicJudge,
  JailbreakFitness,
  LLMAttackGenome,
  MockTarget,
  MultiTurnGenome,
  SystemPromptDefense,
} from "./llm.ts";
import { ReportExporter } from "./report.ts";
import type { Rng } from "./rng.ts";
import {
  BehaviorDescriptor,
  type Fitness,
  type FitnessResult,
  FitnessValue,
  type Genome,
  Stimulus,
} from "./types.ts";

export const CONFORMANCE_SEED = 20260531;

/** A minimal, dependency-free toy genome for L1 engine conformance. */
export class ToyGenome implements Genome {
  value: number;
  constructor(value = 0) {
    this.value = value;
  }
  static random(rng: Rng): ToyGenome {
    return new ToyGenome(rng.nextDouble());
  }
  static fromDict(data: Record<string, unknown>): ToyGenome {
    return new ToyGenome(data.value as number);
  }
  mutate(rng: Rng): ToyGenome {
    return new ToyGenome(Math.min(1, Math.max(0, this.value + rng.uniform(-0.1, 0.1))));
  }
  crossover(other: Genome, rng: Rng): ToyGenome {
    const a = rng.nextDouble();
    return new ToyGenome(a * this.value + (1 - a) * (other as ToyGenome).value);
  }
  toStimulus(): Stimulus {
    return Stimulus.singleTurn(this.value.toFixed(6));
  }
  behavior(): BehaviorDescriptor {
    return new BehaviorDescriptor([this.value]);
  }
  distance(other: Genome): number {
    return Math.abs(this.value - (other as ToyGenome).value);
  }
  toDict(): Record<string, unknown> {
    return { value: this.value };
  }
}

class ToyFitness implements Fitness {
  async evaluate(genome: Genome): Promise<FitnessResult> {
    const g = genome as ToyGenome;
    return { fitness: new FitnessValue(g.value), behavior: g.behavior() };
  }
  async evaluateBatch(genomes: Genome[]): Promise<FitnessResult[]> {
    return Promise.all(genomes.map((g) => this.evaluate(g)));
  }
}

/** L1: generic engine determinism with the toy genome. Returns the archive wire dict. */
export async function runL1(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const archive = new MapElitesArchive([new BehaviorDimension("value", 0, 1, 10)]);
  await evolve(ToyGenome, new ToyFitness(), {
    generations: 20,
    populationSize: 24,
    seed,
    archive,
  });
  return archive.toDict();
}

/** L2: LLM-domain determinism (LLMAttackGenome + deterministic MockTarget + HeuristicJudge). */
export async function runL2(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const archive = new MapElitesArchive([
    new BehaviorDimension("strategy", 0, 1, 6),
    new BehaviorDimension("encoding", 0, 1, 6),
    new BehaviorDimension("has_persona", 0, 1, 2),
  ]);
  await evolve(LLMAttackGenome, new JailbreakFitness(new MockTarget()), {
    generations: 20,
    populationSize: 24,
    seed,
    archive,
  });
  return archive.toDict();
}

/** L3: compliance report projected from the L2 archive. */
export async function runL3(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const archive = new MapElitesArchive([
    new BehaviorDimension("strategy", 0, 1, 6),
    new BehaviorDimension("encoding", 0, 1, 6),
    new BehaviorDimension("has_persona", 0, 1, 2),
  ]);
  await evolve(LLMAttackGenome, new JailbreakFitness(new MockTarget()), {
    generations: 20,
    populationSize: 24,
    seed,
    archive,
  });
  const report = new ReportExporter().export(archive.getAll(), {
    campaignId: "conformance-l2",
    coverage: archive.coverage(),
  });
  return report.toDict();
}

/** L4: multi-turn (Crescendo-style) determinism. */
export async function runL4MultiTurn(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const archive = new MapElitesArchive([
    new BehaviorDimension("turns", 0, 1, 5),
    new BehaviorDimension("escalation", 0, 1, 3),
    new BehaviorDimension("has_persona", 0, 1, 2),
  ]);
  await evolve(MultiTurnGenome, new JailbreakFitness(new MockTarget()), {
    generations: 20,
    populationSize: 24,
    seed,
    archive,
  });
  return archive.toDict();
}

/** L4: agentic / tool-use determinism. */
export async function runL4Agentic(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const archive = new MapElitesArchive([
    new BehaviorDimension("strategy", 0, 1, 4),
    new BehaviorDimension("steps", 0, 1, 5),
    new BehaviorDimension("tool", 0, 1, 5),
  ]);
  await evolve(AgenticGenome, new JailbreakFitness(new MockTarget()), {
    generations: 20,
    populationSize: 24,
    seed,
    archive,
  });
  return archive.toDict();
}

/** L5: competitive co-evolution determinism (attacker vs defender). */
export async function runL5(seed: number = CONFORMANCE_SEED): Promise<Record<string, unknown>> {
  const baseTarget = new MockTarget();
  const judge = new HeuristicJudge();
  const result = await coevolve(
    LLMAttackGenome,
    SystemPromptDefense,
    (d) => new JailbreakFitness((d as SystemPromptDefense).asDefense(baseTarget), judge),
    (a) => new DefenderBlockFitness(a, baseTarget, judge),
    { generations: 15, populationSize: 24, seed },
  );
  return {
    best_attacker: result.bestAttacker.toDict(),
    best_defender: result.bestDefender.toDict(),
    attacker_fitness: result.attackerFitness,
    defender_fitness: result.defenderFitness,
    generations: result.generations,
    history: result.history,
  };
}
