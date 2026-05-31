import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OpenAITarget,
  AnthropicTarget,
  GeminiTarget,
  OllamaTarget,
  TargetError,
  RateLimitError,
  NetworkError,
} from "../src/llm.ts";

function load(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`./fixtures/providers/${name}.json`, import.meta.url), "utf8"));
}

interface Captured {
  url: string;
  init: RequestInit;
}

function mockFetch(captured: Captured[], status = 200, body: unknown = {}, throwErr?: Error): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    if (throwErr) throw throwErr;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const OLLAMA_FIXTURE = {
  model: "llama2",
  message: { role: "assistant", content: "pong" },
  done: true,
  eval_count: 7,
};

// --- request construction + response parsing (offline) -----------------------

test("OpenAI: request shape and parsing", async () => {
  const fixture = load("openai_chat");
  const cap: Captured[] = [];
  const t = new OpenAITarget({ model: "gpt-4o-mini", apiKey: "test-key", fetchFn: mockFetch(cap, 200, fixture) });
  const r = await t.query("ping");

  assert.equal(cap[0].url, "https://api.openai.com/v1/chat/completions");
  const headers = cap[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
  const sent = JSON.parse(cap[0].init.body as string);
  assert.equal(sent.model, "gpt-4o-mini");
  assert.deepEqual(sent.messages, [{ role: "user", content: "ping" }]);

  assert.equal(r.content, fixture.choices[0].message.content);
  assert.equal(r.tokensUsed, fixture.usage.total_tokens);
});

test("Anthropic: request shape, system extraction, parsing", async () => {
  const fixture = load("anthropic_messages");
  const cap: Captured[] = [];
  const t = new AnthropicTarget({ model: "claude-x", apiKey: "test-key", fetchFn: mockFetch(cap, 200, fixture) });
  const r = await t.query("ping");

  assert.equal(cap[0].url, "https://api.anthropic.com/v1/messages");
  const headers = cap[0].init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "test-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(r.content, fixture.content[0].text);
  assert.equal(r.tokensUsed, fixture.usage.input_tokens + fixture.usage.output_tokens);
});

test("Gemini: request shape and parsing", async () => {
  const fixture = load("gemini_generate");
  const cap: Captured[] = [];
  const t = new GeminiTarget({ model: "gemini-2.0-flash", apiKey: "test-key", fetchFn: mockFetch(cap, 200, fixture) });
  const r = await t.query("ping");

  assert.ok(cap[0].url.includes("/v1beta/models/gemini-2.0-flash:generateContent"));
  assert.ok(cap[0].url.includes("key=test-key"));
  const sent = JSON.parse(cap[0].init.body as string);
  assert.equal(sent.contents[0].parts[0].text, "ping");

  const parts = fixture.candidates[0].content.parts as { text?: string }[];
  assert.equal(r.content, parts.map((p) => p.text ?? "").join(""));
  assert.equal(r.tokensUsed, fixture.usageMetadata.totalTokenCount);
});

test("Ollama: request shape and parsing", async () => {
  const cap: Captured[] = [];
  const t = new OllamaTarget({ model: "llama2", fetchFn: mockFetch(cap, 200, OLLAMA_FIXTURE) });
  const r = await t.query("ping");
  assert.equal(cap[0].url, "http://localhost:11434/api/chat");
  assert.equal(r.content, "pong");
  assert.equal(r.tokensUsed, 7);
});

// --- error mapping (offline) --------------------------------------------------

test("rate limit -> RateLimitError", async () => {
  const t = new OpenAITarget({ apiKey: "t", fetchFn: mockFetch([], 429, {}) });
  await assert.rejects(t.query("x"), RateLimitError);
});

test("http error -> TargetError", async () => {
  const t = new AnthropicTarget({ apiKey: "t", fetchFn: mockFetch([], 500, {}) });
  await assert.rejects(t.query("x"), TargetError);
});

test("network throw -> NetworkError", async () => {
  const t = new OpenAITarget({ apiKey: "t", fetchFn: mockFetch([], 200, {}, new Error("boom")) });
  await assert.rejects(t.query("x"), NetworkError);
});

// --- live smokes (skipped without keys) --------------------------------------

const PROMPT = "Reply with the single word: pong";

test("OpenAI live", { skip: !process.env.OPENAI_API_KEY }, async () => {
  const r = await new OpenAITarget({ model: "gpt-4o-mini" }).query(PROMPT);
  assert.ok(r.content.trim().length > 0);
});

test("Anthropic live", { skip: !process.env.ANTHROPIC_API_KEY }, async () => {
  const r = await new AnthropicTarget({ model: "claude-haiku-4-5-20251001" }).query(PROMPT);
  assert.ok(r.content.trim().length > 0);
});

test("Gemini live", { skip: !(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) }, async () => {
  const r = await new GeminiTarget({ model: "gemini-2.0-flash" }).query(PROMPT);
  assert.ok(r.content.trim().length > 0);
});

async function ollamaModel(): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    const models = ((await res.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? [];
    for (const pref of ["mistral:7b", "llama3.1:8b"]) if (models.includes(pref)) return pref;
    const small = models.filter((m) => ["7b", "8b", "3b", "1b", "mini", "small"].some((s) => m.includes(s)));
    return small[0] ?? models[0] ?? null;
  } catch {
    return null;
  }
}

test("Ollama live", async (t) => {
  const model = await ollamaModel();
  if (!model) return t.skip("Ollama not reachable / no models");
  const r = await new OllamaTarget({ model }).query(PROMPT);
  assert.ok(r.content.trim().length > 0);
});
