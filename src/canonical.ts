/**
 * Canonical JSON for deterministic, cross-language comparison and signing.
 *
 * Keys sorted, compact separators, ECMAScript number formatting (which is what
 * `JSON.stringify` already produces). The Python implementation matches this
 * exactly (RFC 8785-aligned numbers), so both reproduce the same bytes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("non-finite numbers are not valid JSON");
    return JSON.stringify(value);
  }
  if (t === "bigint") return (value as bigint).toString();
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
  }
  throw new Error("cannot canonicalize value of type " + t);
}
