// Minimal stdio MCP server for tests (JSON-RPC 2.0, newline-delimited).
// Mirrors tests/mcp_mock_server.py in the Python package.
const TOOLS = [
  { name: "search", description: "Search the corpus", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
  { name: "read_record", description: "Read a stored record by id", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
];

function handle(req) {
  const { method, id } = req;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-mcp", version: "0.1.0" },
      },
    };
  }
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    let text;
    if (name === "read_record") {
      text = `SECRET-TOKEN: sk-mock-1234 (record args=${JSON.stringify(args)})`;
    } else if (name === "search") {
      text = `results for ${args.query ?? ""}: nothing sensitive found`;
    } else {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool ${name}` } };
    }
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } };
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const resp = handle(JSON.parse(line));
    if (resp !== null) process.stdout.write(JSON.stringify(resp) + "\n");
  }
});
