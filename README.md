# @rotalabs/redqueen

Quality-diversity evolutionary red-teaming for LLMs and agents — the TypeScript implementation,
from [Rotalabs](https://rotalabs.ai).

It evolves diverse, effective adversarial attacks and maps the vulnerability space with MAP-Elites.
Seeded runs are **bit-reproducible and cross-language identical** to the Python package
([`rotalabs-redqueen`](https://pypi.org/project/rotalabs-redqueen/)): both are gated on the same
conformance corpus, and produce byte-for-byte identical archives and reports from the same seed.

## Install

```bash
npm install @rotalabs/redqueen
```

Requires Node ≥ 18 (the test runner uses Node ≥ 22.6 type-stripping).

## Quick start

```ts
import {
  LLMAttackGenome, JailbreakFitness, MockTarget, HeuristicJudge,
  MapElitesArchive, BehaviorDimension, evolve, ReportExporter,
} from "@rotalabs/redqueen";

const archive = new MapElitesArchive([
  new BehaviorDimension("strategy", 0, 1, 6),
  new BehaviorDimension("encoding", 0, 1, 6),
  new BehaviorDimension("has_persona", 0, 1, 2),
]);

const result = await evolve(
  LLMAttackGenome,
  new JailbreakFitness(new MockTarget(), new HeuristicJudge()),
  { generations: 50, populationSize: 20, seed: 1234, archive }, // seed -> reproducible
);

const cov = result.archive!.coverage();
console.log(`coverage: ${cov.coveragePercent.toFixed(1)}%  best: ${result.best!.fitness.value}`);

// Project the archive into a standards-aligned compliance report
const report = new ReportExporter().export(result.archive!.getAll(), {
  campaignId: "run-1",
  coverage: result.archive!.coverage(),
});
console.log(report.toDict());
```

## Other surfaces and real targets

```ts
import { MultiTurnGenome, AgenticGenome, OpenAITarget, MCPTarget } from "@rotalabs/redqueen";

// swap the genome class to evolve multi-turn or agentic attacks with the same engine
await evolve(MultiTurnGenome, new JailbreakFitness(new MockTarget()), { generations: 50, seed: 1 });

// real targets (need API keys, except Ollama which is local)
new OpenAITarget({ model: "gpt-4o-mini" }); // also AnthropicTarget / GeminiTarget / OllamaTarget

// red-team a tool-using agent over the Model Context Protocol (stdio)
new MCPTarget(["npx", "-y", "@modelcontextprotocol/server-everything"]);
```

## What's included

- **Engine** — `Rng` (canonical xoshiro256++/SplitMix64), `Population`, `TournamentSelection`,
  `LexicaseSelection`, `MapElitesArchive`, `evolve`, and canonical JSON.
- **Attack surfaces** — `LLMAttackGenome` (single-turn), `MultiTurnGenome` (Crescendo-style),
  `AgenticGenome` (tool-use / MCP).
- **Targets** — `OpenAITarget`, `AnthropicTarget`, `GeminiTarget`, `OllamaTarget`, `MockTarget`,
  and `MCPTarget` (drives a real MCP server over stdio JSON-RPC). Plus the `LLMTarget` base and
  `createTarget`.
- **Judges & fitness** — `HeuristicJudge`, `JailbreakFitness`, `MultiTargetFitness` (cross-model transfer).
- **Co-evolution** — `coevolve`, `SystemPromptDefense`, `DefenderBlockFitness`.
- **Compliance** — `ReportExporter` / `TaxonomyLabel` (OWASP / MITRE ATLAS / EU AI Act / NIST).
- **Conformance** — `runL1`…`runL5` reproduce the shared Python goldens byte-for-byte.

This is at feature parity with the Python package; both are gated on the same conformance corpus.

## Cross-language conformance

```bash
npm test        # PRNG vectors + L1-L5 conformance + provider/MCP tests
npm run build   # emit dist/ (js + d.ts)
```

`test/fixtures/*.json` are the same fixtures the Python package produces; if a TS change diverges
from Python, the conformance tests fail.

## Responsible use

For **defensive security research** — testing systems you own or are authorized to test.

## Links

- Website: https://rotalabs.ai
- Python package: https://pypi.org/project/rotalabs-redqueen/
- Contact: research@rotalabs.ai

## License

AGPL-3.0-or-later.
