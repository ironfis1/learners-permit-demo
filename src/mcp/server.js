// MCP endpoint, mounted into the same Express app at /mcp.
//
// Transport choice (Day 4 success criterion: confirmed, not assumed): the
// SDK offers an SSE-based Streamable HTTP mode for server-initiated
// streaming, and a stateless request/response mode that needs no persistent
// connection. We use the stateless mode deliberately, not as an untested
// fallback: none of these four tools need streaming (they return a single
// JSON result each), and a stateless request/response cycle sidesteps any
// risk of Upsun's routing layer buffering or timing out a long-lived SSE
// connection entirely, rather than discovering that risk live. A fresh
// McpServer + transport is created per request per the SDK's own documented
// stateless pattern (examples/server/simpleStatelessStreamableHttp.js).
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const { perIpLimiter } = require("../middleware/rateLimit");
const { listPendingDecisions, getDecision, getPermitStatus, getAuditTrail, VALID_CATEGORIES } = require("./data");

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

function buildServer() {
  const server = new McpServer({ name: "learners-permit-mcp", version: "1.0.0" });

  server.registerTool(
    "list_pending_decisions",
    { description: "List decisions still awaiting review (mirrors the app's Decision Queue)." },
    async () => {
      try {
        return textResult(await listPendingDecisions());
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "get_decision",
    {
      description: "Get full context for one scenario by id, including its review status and recommendation if reviewed.",
      inputSchema: { id: z.number().int().describe("Scenario id (1-16)") },
    },
    async ({ id }) => {
      try {
        const decision = await getDecision(id);
        if (!decision) return errorResult(`No scenario with id ${id}.`);
        return textResult(decision);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "get_permit_status",
    {
      description: "Get the current stage (Learner's Permit / Supervised / Licensed), accuracy, and total reviewed for a category.",
      inputSchema: { category: z.enum([...VALID_CATEGORIES]).describe("dispatch | invoice | refund | escalation") },
    },
    async ({ category }) => {
      try {
        return textResult(await getPermitStatus(category));
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "get_audit_trail",
    {
      description: "Get the persisted review history, newest first, optionally filtered to one category.",
      inputSchema: { category: z.enum([...VALID_CATEGORIES]).optional().describe("Optional: dispatch | invoice | refund | escalation") },
    },
    async ({ category }) => {
      try {
        return textResult(await getAuditTrail(category));
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  return server;
}

const router = express.Router();

// Same rate-limit posture as the HTTP API (Day 2) - this endpoint doesn't
// call Anthropic, but it's still a read path into the same data, and
// shouldn't become an uncapped side door around the app's other controls.
router.post("/mcp", perIpLimiter, express.json(), async (req, res) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode doesn't support GET (server-initiated streams) or DELETE
// (session termination) - there's no session to stream to or terminate.
router.get("/mcp", (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
});
router.delete("/mcp", (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
});

module.exports = router;
