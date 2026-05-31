/**
 * MCP target: red-team a tool-using agent over the Model Context Protocol.
 *
 * Spawns an MCP server (stdio transport, JSON-RPC 2.0), performs the initialize
 * handshake, lists its tools, and executes an agentic Stimulus's action plan by
 * calling those tools. Mirrors the Python `MCPTarget`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { LLMTarget, TargetError, type TargetResponse } from "./llm.ts";
import { AGENTIC, type Message, Stimulus, type ToolCall, Transcript } from "./types.ts";

export class MCPTarget extends LLMTarget {
  command: string[];
  protocolVersion: string;
  tools: { name: string; [k: string]: unknown }[] = [];
  private displayName: string;
  private proc: ChildProcess | null = null;
  private nextId = 0;
  private buffer = "";
  private lines: string[] = [];
  private waiters: ((line: string) => void)[] = [];

  constructor(command: string[], opts: { name?: string; protocolVersion?: string } = {}) {
    super();
    this.command = command;
    this.protocolVersion = opts.protocolVersion ?? "2024-11-05";
    this.displayName = opts.name ?? `mcp:${command[command.length - 1].split("/").pop()}`;
  }

  override get name(): string {
    return this.displayName;
  }
  override get supportedKinds(): Set<string> {
    return new Set([AGENTIC]);
  }
  override async complete(): Promise<TargetResponse> {
    throw new TargetError("MCPTarget only supports agentic stimuli");
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.lines.push(line);
    }
  }

  private readLine(): Promise<string> {
    const buffered = this.lines.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private send(obj: unknown): void {
    this.proc!.stdin!.write(JSON.stringify(obj) + "\n");
  }

  private async rpc(method: string, params: unknown): Promise<Record<string, any>> {
    this.nextId += 1;
    this.send({ jsonrpc: "2.0", id: this.nextId, method, params });
    const line = await this.readLine();
    if (!line) throw new TargetError(`MCP server closed the connection during ${method}`);
    const resp = JSON.parse(line);
    if (resp.error) throw new TargetError(`MCP error in ${method}: ${resp.error.message}`);
    return resp.result ?? {};
  }

  private async connect(): Promise<void> {
    this.proc = spawn(this.command[0], this.command.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk));
    await this.rpc("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: "rotalabs-redqueen", version: "0.1.0" },
    });
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const result = await this.rpc("tools/list", {});
    this.tools = (result.tools as { name: string }[]) ?? [];
  }

  override async interact(stimulus: Stimulus): Promise<Transcript> {
    if (stimulus.kind !== AGENTIC) {
      throw new TargetError(`${this.id} only supports agentic stimuli, got '${stimulus.kind}'`);
    }
    if (this.proc === null) await this.connect();

    const messages: Message[] = [{ role: "user", content: stimulus.opening ?? stimulus.goal ?? "" }];
    const toolCalls: ToolCall[] = [];
    for (let i = 0; i < (stimulus.actionPlan ?? []).length; i++) {
      const step = stimulus.actionPlan![i];
      const tool = (step.target_tool as string) ?? (this.tools[0]?.name ?? "tool");
      const args = (step.arguments as Record<string, unknown>) ?? { input: step.payload ?? "" };
      const tc: ToolCall = { id: `call_${i}`, tool, arguments: args };
      try {
        const result = await this.rpc("tools/call", { name: tool, arguments: args });
        const content = (result.content as { type: string; text?: string }[]) ?? [];
        tc.result = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        messages.push({ role: "tool", content: tc.result, name: tool });
      } catch (e) {
        tc.error = e instanceof Error ? e.message : String(e);
      }
      toolCalls.push(tc);
    }

    const summary = toolCalls.filter((tc) => tc.result).map((tc) => tc.result).join("\n");
    messages.push({ role: "assistant", content: summary });
    const transcript = new Transcript(this.id, AGENTIC, messages);
    transcript.toolCalls = toolCalls;
    transcript.raw = { tools: this.tools.map((t) => t.name) };
    return transcript;
  }

  override async close(): Promise<void> {
    if (this.proc !== null) {
      this.proc.kill();
      this.proc = null;
    }
  }
}
