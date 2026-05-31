/**
 * Compliance report: projection of a quality-diversity archive over the taxonomy.
 * Mirrors `rotalabs_redqueen.core.report`.
 */
import type { ArchiveCoverage } from "./engine.ts";
import { atlasIds, owaspIds, type TaxonomyLabel } from "./taxonomy.ts";
import { type Individual, SPEC_VERSION } from "./types.ts";

export const REPORT_VERSION = "0.1.0";

interface Labeled {
  label(): TaxonomyLabel;
}

const byKey = (a: [string, unknown], b: [string, unknown]): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

export class Report {
  campaignId: string;
  summary: Record<string, unknown>;
  byHarmCategory: unknown[];
  standards: Record<string, unknown>;
  evidence: unknown[];
  specVersion: string;
  reportVersion: string;

  constructor(
    campaignId: string,
    summary: Record<string, unknown>,
    byHarmCategory: unknown[],
    standards: Record<string, unknown>,
    evidence: unknown[],
  ) {
    this.campaignId = campaignId;
    this.summary = summary;
    this.byHarmCategory = byHarmCategory;
    this.standards = standards;
    this.evidence = evidence;
    this.specVersion = SPEC_VERSION;
    this.reportVersion = REPORT_VERSION;
  }

  toDict(): Record<string, unknown> {
    return {
      spec_version: this.specVersion,
      report_version: this.reportVersion,
      campaign_id: this.campaignId,
      summary: this.summary,
      by_harm_category: this.byHarmCategory,
      standards: this.standards,
      evidence: this.evidence,
    };
  }
}

export class ReportExporter {
  successThreshold: number;
  constructor(successThreshold = 0.5) {
    this.successThreshold = successThreshold;
  }

  export(
    individuals: Individual[],
    opts: { campaignId?: string; coverage?: ArchiveCoverage } = {},
  ): Report {
    const campaignId = opts.campaignId ?? "campaign";
    const all = [...individuals];
    const successful = all.filter((i) => i.fitness.value >= this.successThreshold);

    const harm = new Map<string, { count: number; maxScore: number }>();
    const owaspCounts = new Map<string, number>();
    const atlasCounts = new Map<string, number>();
    const evidence: unknown[] = [];

    for (const ind of successful) {
      const label = (ind.genome as unknown as Labeled).label();
      const score = ind.fitness.value;
      const bucket = harm.get(label.harmCategory) ?? { count: 0, maxScore: 0 };
      bucket.count += 1;
      bucket.maxScore = Math.max(bucket.maxScore, score);
      harm.set(label.harmCategory, bucket);
      for (const oid of owaspIds(label.strategy)) owaspCounts.set(oid, (owaspCounts.get(oid) ?? 0) + 1);
      for (const aid of atlasIds(label.strategy)) atlasCounts.set(aid, (atlasCounts.get(aid) ?? 0) + 1);
      evidence.push({ label: label.toDict(), score });
    }

    const summary: Record<string, unknown> = {
      evaluated: all.length,
      attacks_found: successful.length,
      success_threshold: this.successThreshold,
    };
    if (opts.coverage) {
      summary.coverage_percent = opts.coverage.coveragePercent;
      summary.filled_cells = opts.coverage.filledCells;
    }

    const byHarmCategory = [...harm.entries()]
      .sort(byKey)
      .map(([h, v]) => ({ harm_category: h, count: v.count, max_score: v.maxScore }));

    const standards = {
      owasp: [...owaspCounts.entries()]
        .sort(byKey)
        .map(([k, v]) => ({ id: k, covered: true, evidence_count: v })),
      mitre_atlas: [...atlasCounts.entries()]
        .sort(byKey)
        .map(([k, v]) => ({ id: k, covered: true, evidence_count: v })),
      eu_ai_act_art55: { adversarial_testing_documented: successful.length > 0 },
      nist_ai_rmf: { govern_1_7: successful.length > 0 ? "addressed" : "not_addressed" },
    };

    return new Report(campaignId, summary, byHarmCategory, standards, evidence);
  }
}
