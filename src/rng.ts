/**
 * Canonical seedable PRNG: xoshiro256++ seeded by SplitMix64.
 *
 * Identical algorithm and derived operations as the Python implementation, so a
 * given seed produces the same stream in both. Verified against the shared
 * `vectors.json` corpus. See `_dev/redqueen-spec/conformance/prng/`.
 */

const MASK = (1n << 64n) - 1n;
const TWO53 = 2 ** 53;

function splitmix64(state: bigint): [bigint, bigint] {
  state = (state + 0x9e3779b97f4a7c15n) & MASK;
  let z = state;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  z = z ^ (z >> 31n);
  return [state, z];
}

function seedState(seed: bigint): bigint[] {
  let st = seed & MASK;
  const s: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    const [ns, z] = splitmix64(st);
    st = ns;
    s.push(z);
  }
  return s;
}

const rotl = (x: bigint, k: bigint): bigint => ((x << k) | (x >> (64n - k))) & MASK;

export class Rng {
  private s: bigint[];

  constructor(seed: number | bigint) {
    this.s = seedState(BigInt(seed) & MASK);
  }

  /** The 4x u64 internal state (copy), for conformance vector checks. */
  state(): bigint[] {
    return this.s.slice();
  }

  nextU64(): bigint {
    const s = this.s;
    const result = (rotl((s[0] + s[3]) & MASK, 23n) + s[0]) & MASK;
    const t = (s[1] << 17n) & MASK;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 45n);
    return result;
  }

  nextDouble(): number {
    return Number(this.nextU64() >> 11n) / TWO53;
  }

  below(n: number): number {
    if (n <= 0) return 0;
    const bn = BigInt(n);
    let x = this.nextU64();
    let m = x * bn;
    let low = m & MASK;
    if (low < bn) {
      const t = (1n << 64n) % bn;
      while (low < t) {
        x = this.nextU64();
        m = x * bn;
        low = m & MASK;
      }
    }
    return Number(m >> 64n);
  }

  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.below(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  random(): number {
    return this.nextDouble();
  }

  uniform(low = 0, high = 1): number {
    return low + (high - low) * this.nextDouble();
  }

  integers(low: number, high?: number): number {
    if (high === undefined) return this.below(low);
    return low + this.below(high - low);
  }

  choice(n: number, size?: number, replace = false): number | number[] {
    if (size === undefined) return this.below(n);
    if (replace) return Array.from({ length: size }, () => this.below(n));
    const pool = Array.from({ length: n }, (_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < size; i++) {
      const j = i + this.below(n - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
      out.push(pool[i]);
    }
    return out;
  }
}
