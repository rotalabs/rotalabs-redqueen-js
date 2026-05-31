/**
 * Attack taxonomy labels and standards crosswalk. Mirrors
 * `rotalabs_redqueen.core.taxonomy` (redqueen-spec taxonomy.md).
 */
export const TAXONOMY_VERSION = "2026.1";

// Strategy -> OWASP IDs (LLM Top-10 2025 + Agentic Top-10 placeholders).
const OWASP: Record<string, string[]> = {
  direct: ["LLM01"],
  roleplay: ["LLM01"],
  authority: ["LLM01"],
  hypothetical: ["LLM01"],
  encoding: ["LLM01"],
  prompt_injection: ["LLM01"],
  multi_turn_escalation: ["LLM01"],
  tool_misuse: ["LLM06", "AGENT02"],
  goal_hijack: ["LLM06", "AGENT01"],
  memory_poisoning: ["AGENT06"],
  context_poisoning: ["AGENT06"],
};

// Strategy -> MITRE ATLAS technique IDs (placeholders; verify against the live matrix).
const ATLAS: Record<string, string[]> = {
  roleplay: ["AML.T0054"],
  hypothetical: ["AML.T0054"],
  multi_turn_escalation: ["AML.T0054"],
  prompt_injection: ["AML.T0051"],
  encoding: ["AML.T0051"],
  tool_misuse: ["AML.T0053"],
  goal_hijack: ["AML.T0053"],
};

export function owaspIds(strategy: string): string[] {
  return [...(OWASP[strategy] ?? [])];
}

export function atlasIds(strategy: string): string[] {
  return [...(ATLAS[strategy] ?? [])];
}

export class TaxonomyLabel {
  surface: string;
  strategy: string;
  harmCategory: string;
  encoding: string;
  taxonomyVersion: string;

  constructor(surface: string, strategy: string, harmCategory: string, encoding = "none") {
    this.surface = surface;
    this.strategy = strategy;
    this.harmCategory = harmCategory;
    this.encoding = encoding;
    this.taxonomyVersion = TAXONOMY_VERSION;
  }

  toDict(): Record<string, unknown> {
    return {
      surface: this.surface,
      strategy: this.strategy,
      harm_category: this.harmCategory,
      encoding: this.encoding,
      owasp: owaspIds(this.strategy),
      atlas: atlasIds(this.strategy),
      taxonomy_version: this.taxonomyVersion,
    };
  }
}
