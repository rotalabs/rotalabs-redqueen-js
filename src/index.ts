/**
 * @rotalabs/redqueen — quality-diversity evolutionary red-teaming for LLMs and agents.
 *
 * This release ships the deterministic core engine (TypeScript), gated on the same
 * cross-language conformance corpus as the Python package. The LLM attack domain
 * (genomes, targets, judges, reporting) lands incrementally on top of these primitives.
 */
export { Rng } from "./rng.ts";
export { canonicalJson } from "./canonical.ts";
export {
  SPEC_VERSION,
  SINGLE_TURN,
  MULTI_TURN,
  AGENTIC,
  Stimulus,
  Transcript,
  BehaviorDescriptor,
  FitnessValue,
  Individual,
} from "./types.ts";
export type { Message, ToolCall, Fitness, FitnessResult, Genome, GenomeClass } from "./types.ts";
export {
  Population,
  TournamentSelection,
  LexicaseSelection,
  BehaviorDimension,
  MapElitesArchive,
  evolve,
  coevolve,
} from "./engine.ts";
export type {
  Selection,
  EvolveOptions,
  EvolutionResult,
  ArchiveCoverage,
  CoevolutionResult,
  CoevolveOptions,
} from "./engine.ts";
export {
  ATTACK_STRATEGIES,
  ENCODINGS,
  HARM_CATEGORIES,
  ESCALATIONS,
  AGENTIC_STRATEGIES,
  PERSONAS,
  LLMAttackGenome,
  MultiTurnGenome,
  AgenticGenome,
  LLMTarget,
  MockTarget,
  OpenAITarget,
  AnthropicTarget,
  GeminiTarget,
  OllamaTarget,
  createTarget,
  TargetError,
  RateLimitError,
  NetworkError,
  HeuristicJudge,
  JailbreakFitness,
  MultiTargetFitness,
  SystemPromptDefense,
  DefendedTarget,
  DefenderBlockFitness,
} from "./llm.ts";
export type { Persona, TargetResponse, JudgeResult } from "./llm.ts";
export { MCPTarget } from "./mcp.ts";
export { TaxonomyLabel, TAXONOMY_VERSION, owaspIds, atlasIds } from "./taxonomy.ts";
export { Report, ReportExporter, REPORT_VERSION } from "./report.ts";
export {
  CONFORMANCE_SEED,
  ToyGenome,
  runL1,
  runL2,
  runL3,
  runL4MultiTurn,
  runL4Agentic,
  runL5,
} from "./conformance.ts";
