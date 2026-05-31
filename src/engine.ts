/**
 * Generic evolutionary engine: population, selection, MAP-Elites archive, and
 * the evolution loop. The RNG draw order mirrors the Python implementation
 * exactly so seeded runs reproduce the same archive across languages.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson } from "./canonical.ts";
import { Rng } from "./rng.ts";
import {
  BehaviorDescriptor,
  type Fitness,
  FitnessValue,
  type Genome,
  type GenomeClass,
  Individual,
  SPEC_VERSION,
} from "./types.ts";

export class Population {
  individuals: Individual[];
  generation: number;

  constructor(individuals: Individual[] = [], generation = 0) {
    this.individuals = individuals;
    this.generation = generation;
  }

  static random(genomeClass: GenomeClass, size: number, rng: Rng): Population {
    const individuals: Individual[] = [];
    for (let i = 0; i < size; i++) individuals.push(new Individual(genomeClass.random(rng)));
    return new Population(individuals);
  }

  get length(): number {
    return this.individuals.length;
  }

  best(): Individual | null {
    if (this.individuals.length === 0) return null;
    let best = this.individuals[0];
    for (let i = 1; i < this.individuals.length; i++) {
      if (this.individuals[i].fitness.value > best.fitness.value) best = this.individuals[i];
    }
    return best;
  }

  topN(n: number): Individual[] {
    // Stable descending sort; ties keep original order (matches Python sorted(reverse=True)).
    return [...this.individuals]
      .sort((a, b) => b.fitness.value - a.fitness.value)
      .slice(0, n);
  }

  tournamentSelect(tournamentSize: number, rng: Rng): Individual {
    const idx = rng.choice(this.individuals.length, tournamentSize, false) as number[];
    let best = this.individuals[idx[0]];
    for (let k = 1; k < idx.length; k++) {
      const c = this.individuals[idx[k]];
      if (c.fitness.value > best.fitness.value) best = c;
    }
    return best;
  }

  selectParents(n: number, tournamentSize: number, rng: Rng): Individual[] {
    const out: Individual[] = [];
    for (let i = 0; i < n; i++) out.push(this.tournamentSelect(tournamentSize, rng));
    return out;
  }
}

export interface Selection {
  select(population: Population, n: number, rng: Rng): Individual[];
}

export class TournamentSelection implements Selection {
  tournamentSize: number;
  constructor(tournamentSize = 3) {
    this.tournamentSize = tournamentSize;
  }
  select(population: Population, n: number, rng: Rng): Individual[] {
    return population.selectParents(n, this.tournamentSize, rng);
  }
}

export class LexicaseSelection implements Selection {
  epsilon: number;
  constructor(epsilon = 0) {
    this.epsilon = epsilon;
  }
  private cases(ind: Individual): number[] {
    return ind.fitness.objectives ?? [ind.fitness.value];
  }
  select(population: Population, n: number, rng: Rng): Individual[] {
    const individuals = population.individuals;
    if (individuals.length === 0) return [];
    const out: Individual[] = [];
    for (let i = 0; i < n; i++) out.push(this.selectOne(individuals, rng));
    return out;
  }
  private selectOne(individuals: Individual[], rng: Rng): Individual {
    let candidates = [...individuals];
    const caseOrder = Array.from({ length: this.cases(candidates[0]).length }, (_, i) => i);
    rng.shuffle(caseOrder);
    for (const c of caseOrder) {
      if (candidates.length === 1) break;
      let best = -Infinity;
      for (const cand of candidates) best = Math.max(best, this.cases(cand)[c]);
      candidates = candidates.filter((cand) => this.cases(cand)[c] >= best - this.epsilon);
    }
    if (candidates.length === 1) return candidates[0];
    return candidates[rng.below(candidates.length)];
  }
}

export class BehaviorDimension {
  name: string;
  minValue: number;
  maxValue: number;
  bins: number;
  constructor(name: string, minValue: number, maxValue: number, bins = 10) {
    this.name = name;
    this.minValue = minValue;
    this.maxValue = maxValue;
    this.bins = bins;
  }
  getBin(value: number): number {
    value = Math.max(this.minValue, Math.min(this.maxValue, value));
    const normalized = (value - this.minValue) / (this.maxValue - this.minValue + 1e-10);
    return Math.min(Math.trunc(normalized * this.bins), this.bins - 1);
  }
}

export interface ArchiveCoverage {
  filledCells: number;
  totalCells: number;
  coveragePercent: number;
}

function compareCoords(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export class MapElitesArchive {
  dimensions: BehaviorDimension[];
  cells: Map<string, { coords: number[]; ind: Individual }>;

  constructor(dimensions: BehaviorDimension[]) {
    this.dimensions = dimensions;
    this.cells = new Map();
  }

  private cellKey(behavior: BehaviorDescriptor): { coords: number[]; key: string } {
    if (behavior.values.length !== this.dimensions.length) {
      throw new Error(
        `behavior has ${behavior.values.length} dims, archive has ${this.dimensions.length}`,
      );
    }
    const coords = this.dimensions.map((d, i) => d.getBin(behavior.values[i]));
    return { coords, key: coords.join(",") };
  }

  add(individual: Individual): boolean {
    const { coords, key } = this.cellKey(individual.behavior);
    const existing = this.cells.get(key);
    if (!existing) {
      this.cells.set(key, { coords, ind: individual });
      return true;
    }
    if (individual.fitness.value > existing.ind.fitness.value) {
      this.cells.set(key, { coords, ind: individual });
      return true;
    }
    return false;
  }

  getAll(): Individual[] {
    return [...this.cells.values()].map((c) => c.ind);
  }

  best(): Individual | null {
    let best: Individual | null = null;
    for (const { ind } of this.cells.values()) {
      if (best === null || ind.fitness.value > best.fitness.value) best = ind;
    }
    return best;
  }

  coverage(): ArchiveCoverage {
    let total = 1;
    for (const d of this.dimensions) total *= d.bins;
    return {
      filledCells: this.cells.size,
      totalCells: total,
      coveragePercent: total === 0 ? 0 : (100 * this.cells.size) / total,
    };
  }

  toDict(): Record<string, unknown> {
    const cov = this.coverage();
    const cells = [...this.cells.values()]
      .sort((a, b) => compareCoords(a.coords, b.coords))
      .map((c) => ({
        coords: c.coords,
        elite: {
          genome: c.ind.genome.toDict(),
          fitness: {
            value: c.ind.fitness.value,
            objectives: c.ind.fitness.objectives ?? null,
          },
          behavior: { values: c.ind.behavior.values },
          generation: c.ind.birthGeneration,
        },
      }));
    return {
      spec_version: SPEC_VERSION,
      dimensions: this.dimensions.map((d) => ({
        name: d.name,
        min: d.minValue,
        max: d.maxValue,
        bins: d.bins,
      })),
      cells,
      coverage: {
        filled_cells: cov.filledCells,
        total_cells: cov.totalCells,
        coverage_percent: cov.coveragePercent,
      },
    };
  }

  seed(n: number, rng: Rng): Genome[] {
    const all = this.getAll();
    if (all.length <= n) return all.map((i) => i.genome);
    const idx = rng.choice(all.length, n, false) as number[];
    return idx.map((i) => all[i].genome);
  }

  save(uri: string): void {
    const path = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
    writeFileSync(path, canonicalJson(this.toDict()) + "\n");
  }

  static load(uri: string, genomeClass: GenomeClass): MapElitesArchive {
    const path = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
    const data = JSON.parse(readFileSync(path, "utf8")) as {
      dimensions: { name: string; min: number; max: number; bins: number }[];
      cells: { coords: number[]; elite: Record<string, any> }[];
    };
    const dims = data.dimensions.map((d) => new BehaviorDimension(d.name, d.min, d.max, d.bins));
    const archive = new MapElitesArchive(dims);
    for (const cell of data.cells) {
      const e = cell.elite;
      const ind = new Individual(
        genomeClass.fromDict(e.genome),
        new FitnessValue(e.fitness.value, e.fitness.objectives ?? null),
        new BehaviorDescriptor(e.behavior.values),
        e.generation,
      );
      archive.cells.set(cell.coords.join(","), { coords: cell.coords, ind });
    }
    return archive;
  }
}

export interface EvolveOptions {
  generations: number;
  populationSize?: number;
  elitism?: number;
  mutationRate?: number;
  crossoverRate?: number;
  tournamentSize?: number;
  seed?: number;
  archive?: MapElitesArchive;
}

export interface EvolutionResult {
  best: Individual | null;
  population: Population;
  generations: number;
  archive: MapElitesArchive | null;
}

export async function evolve(
  genomeClass: GenomeClass,
  fitness: Fitness,
  opts: EvolveOptions,
): Promise<EvolutionResult> {
  const populationSize = opts.populationSize ?? 100;
  const elitism = opts.elitism ?? 1;
  const mutationRate = opts.mutationRate ?? 0.3;
  const crossoverRate = opts.crossoverRate ?? 0.7;
  const tournamentSize = opts.tournamentSize ?? 3;
  const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = new Rng(seed);
  const selection = new TournamentSelection(tournamentSize);
  const archive = opts.archive ?? null;

  let population = Population.random(genomeClass, populationSize, rng);
  const initial = await fitness.evaluateBatch(population.individuals.map((i) => i.genome));
  population.individuals.forEach((ind, i) => {
    ind.fitness = initial[i].fitness;
    ind.behavior = initial[i].behavior;
    ind.birthGeneration = 0;
  });
  if (archive) for (const ind of population.individuals) archive.add(ind);

  for (let gen = 0; gen < opts.generations; gen++) {
    const offspring = createOffspring(population, selection, rng, {
      populationSize,
      elitism,
      mutationRate,
      crossoverRate,
    });
    const results = await fitness.evaluateBatch(offspring);
    const offspringInds = offspring.map((g, i) => Individual.fromResult(g, results[i], gen + 1));
    if (archive) for (const ind of offspringInds) archive.add(ind);

    const elite = population.topN(elitism);
    population = new Population(elite.concat(offspringInds).slice(0, populationSize), gen + 1);
  }

  return {
    best: population.best(),
    population,
    generations: opts.generations,
    archive,
  };
}

function createOffspring(
  population: Population,
  selection: Selection,
  rng: Rng,
  cfg: { populationSize: number; elitism: number; mutationRate: number; crossoverRate: number },
): Genome[] {
  const offspring: Genome[] = [];
  const nOffspring = cfg.populationSize - cfg.elitism;
  while (offspring.length < nOffspring) {
    const parents = selection.select(population, 2, rng);
    const p1 = parents[0].genome;
    const p2 = parents[1].genome;
    let child = rng.random() < cfg.crossoverRate ? p1.crossover(p2, rng) : p1;
    if (rng.random() < cfg.mutationRate) child = child.mutate(rng);
    offspring.push(child);
  }
  return offspring.slice(0, nOffspring);
}

// --- Competitive co-evolution -------------------------------------------------

export interface CoevolutionResult {
  bestAttacker: Genome;
  bestDefender: Genome;
  attackerFitness: number;
  defenderFitness: number;
  generations: number;
  history: { generation: number; best_attacker_fitness: number; best_defender_fitness: number }[];
}

export interface CoevolveOptions {
  generations: number;
  populationSize?: number;
  elitism?: number;
  mutationRate?: number;
  crossoverRate?: number;
  tournamentSize?: number;
  seed?: number;
}

function bestIndividual(individuals: Individual[]): Individual {
  let best = individuals[0];
  for (let i = 1; i < individuals.length; i++) {
    if (individuals[i].fitness.value > best.fitness.value) best = individuals[i];
  }
  return best;
}

function breed(
  individuals: Individual[],
  rng: Rng,
  populationSize: number,
  elitism: number,
  mutationRate: number,
  crossoverRate: number,
  tournamentSize: number,
): Genome[] {
  const pop = new Population(individuals);
  const selection = new TournamentSelection(tournamentSize);
  const offspring: Genome[] = [];
  const nOffspring = populationSize - elitism;
  while (offspring.length < nOffspring) {
    const parents = selection.select(pop, 2, rng);
    const p1 = parents[0].genome;
    const p2 = parents[1].genome;
    let child = rng.random() < crossoverRate ? p1.crossover(p2, rng) : p1;
    if (rng.random() < mutationRate) child = child.mutate(rng);
    offspring.push(child);
  }
  const elite = pop.topN(elitism).map((i) => i.genome);
  return elite.concat(offspring).slice(0, populationSize);
}

export async function coevolve(
  attackerClass: GenomeClass,
  defenderClass: GenomeClass,
  attackerFitnessVs: (defender: Genome) => Fitness,
  defenderFitnessVs: (attacker: Genome) => Fitness,
  opts: CoevolveOptions,
): Promise<CoevolutionResult> {
  const populationSize = opts.populationSize ?? 20;
  const elitism = opts.elitism ?? 1;
  const mutationRate = opts.mutationRate ?? 0.3;
  const crossoverRate = opts.crossoverRate ?? 0.7;
  const tournamentSize = opts.tournamentSize ?? 3;
  const rng = new Rng(opts.seed ?? Math.floor(Math.random() * 0x7fffffff));

  let attackers: Genome[] = [];
  for (let i = 0; i < populationSize; i++) attackers.push(attackerClass.random(rng));
  let defenders: Genome[] = [];
  for (let i = 0; i < populationSize; i++) defenders.push(defenderClass.random(rng));

  let champAttacker = attackers[0];
  let champDefender = defenders[0];
  let bestA = 0;
  let bestD = 0;
  const history: CoevolutionResult["history"] = [];

  for (let gen = 0; gen < opts.generations; gen++) {
    const aResults = await attackerFitnessVs(champDefender).evaluateBatch(attackers);
    const dResults = await defenderFitnessVs(champAttacker).evaluateBatch(defenders);
    const aInds = attackers.map((g, i) => Individual.fromResult(g, aResults[i], gen));
    const dInds = defenders.map((g, i) => Individual.fromResult(g, dResults[i], gen));
    const ba = bestIndividual(aInds);
    const bd = bestIndividual(dInds);
    champAttacker = ba.genome;
    champDefender = bd.genome;
    bestA = ba.fitness.value;
    bestD = bd.fitness.value;
    history.push({ generation: gen, best_attacker_fitness: bestA, best_defender_fitness: bestD });
    attackers = breed(aInds, rng, populationSize, elitism, mutationRate, crossoverRate, tournamentSize);
    defenders = breed(dInds, rng, populationSize, elitism, mutationRate, crossoverRate, tournamentSize);
  }

  return {
    bestAttacker: champAttacker,
    bestDefender: champDefender,
    attackerFitness: bestA,
    defenderFitness: bestD,
    generations: opts.generations,
    history,
  };
}
