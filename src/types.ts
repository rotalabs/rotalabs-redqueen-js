/**
 * Core types: Stimulus / Transcript phenotype, behavior, fitness, genome contract.
 * Mirrors `rotalabs_redqueen.core` (redqueen-spec types.md / interfaces.md).
 */
import type { Rng } from "./rng.ts";

export const SPEC_VERSION = "0.1.0";

export const SINGLE_TURN = "single_turn";
export const MULTI_TURN = "multi_turn";
export const AGENTIC = "agentic";

export interface ToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  result?: string | null;
  error?: string | null;
}

export interface Message {
  role: string; // system | user | assistant | tool
  content: string;
  toolCalls?: ToolCall[];
  name?: string;
}

/** A tagged-union phenotype: a single prompt, a conversation, or an agentic plan. */
export class Stimulus {
  kind: string;
  prompt?: string;
  system?: string;
  mode?: string;
  turns?: Message[];
  policyRef?: string;
  maxTurns: number;
  goal?: string;
  opening?: string;
  availableTools?: string[];
  actionPlan?: Record<string, unknown>[];
  maxSteps: number;

  constructor(kind: string) {
    this.kind = kind;
    this.maxTurns = 8;
    this.maxSteps = 12;
  }

  static singleTurn(prompt: string, system?: string): Stimulus {
    const s = new Stimulus(SINGLE_TURN);
    s.prompt = prompt;
    s.system = system;
    return s;
  }

  static multiTurn(turns: Message[], maxTurns = 8, mode = "scripted"): Stimulus {
    const s = new Stimulus(MULTI_TURN);
    s.turns = turns;
    s.mode = mode;
    s.maxTurns = maxTurns;
    return s;
  }

  static agentic(
    goal: string,
    opening: string,
    availableTools: string[],
    actionPlan: Record<string, unknown>[],
    maxSteps = 12,
  ): Stimulus {
    const s = new Stimulus(AGENTIC);
    s.goal = goal;
    s.opening = opening;
    s.availableTools = availableTools;
    s.actionPlan = actionPlan;
    s.maxSteps = maxSteps;
    return s;
  }
}

/** A replayable record of executing a Stimulus against a target. */
export class Transcript {
  targetId: string;
  stimulusKind: string;
  messages: Message[];
  toolCalls: ToolCall[];
  finalState: Record<string, unknown>;
  stopReason: string;
  usage: Record<string, number>;
  raw: Record<string, unknown>;
  specVersion: string;

  constructor(targetId: string, stimulusKind: string, messages: Message[] = []) {
    this.targetId = targetId;
    this.stimulusKind = stimulusKind;
    this.messages = messages;
    this.toolCalls = [];
    this.finalState = {};
    this.stopReason = "completed";
    this.usage = { input_tokens: 0, output_tokens: 0, wall_ms: 0 };
    this.raw = {};
    this.specVersion = SPEC_VERSION;
  }

  get assistantText(): string {
    return this.messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
  }
}

export class BehaviorDescriptor {
  values: number[];
  constructor(values: number[]) {
    this.values = values;
  }
  distance(other: BehaviorDescriptor): number {
    if (this.values.length !== other.values.length) throw new Error("dimension mismatch");
    let sum = 0;
    for (let i = 0; i < this.values.length; i++) {
      const d = this.values[i] - other.values[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
}

export class FitnessValue {
  value: number;
  objectives: number[] | null;
  constructor(value = 0, objectives: number[] | null = null) {
    this.value = value;
    this.objectives = objectives;
  }
}

export interface FitnessResult {
  fitness: FitnessValue;
  behavior: BehaviorDescriptor;
}

export interface Fitness {
  evaluate(genome: Genome): Promise<FitnessResult>;
  evaluateBatch(genomes: Genome[]): Promise<FitnessResult[]>;
}

/** The evolvable attack. Its phenotype is a Stimulus. */
export interface Genome {
  mutate(rng: Rng): Genome;
  crossover(other: Genome, rng: Rng): Genome;
  distance(other: Genome): number;
  behavior(): BehaviorDescriptor;
  toStimulus(): Stimulus;
  toDict(): Record<string, unknown>;
}

export interface GenomeClass {
  random(rng: Rng): Genome;
  fromDict(data: Record<string, unknown>): Genome;
}

export class Individual {
  genome: Genome;
  fitness: FitnessValue;
  behavior: BehaviorDescriptor;
  birthGeneration: number;

  constructor(
    genome: Genome,
    fitness: FitnessValue = new FitnessValue(0),
    behavior: BehaviorDescriptor = new BehaviorDescriptor([]),
    birthGeneration = 0,
  ) {
    this.genome = genome;
    this.fitness = fitness;
    this.behavior = behavior;
    this.birthGeneration = birthGeneration;
  }

  static fromResult(genome: Genome, result: FitnessResult, generation = 0): Individual {
    return new Individual(genome, result.fitness, result.behavior, generation);
  }
}
