
import http from "node:http";

import {
  generateAIResponse,
  getConfiguredProviders
} from "./provider-manager.js";

const PORT = Number(process.env.PORT || 3000);

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "*";

const MAX_REQUEST_SIZE = 1024 * 1024;

const server = http.createServer(async (req, res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  let pathname;

  try {
    pathname = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    ).pathname.replace(/\/+$/, "") || "/";
  } catch {
    res.writeHead(400);
    return res.end(JSON.stringify({
      error: "Invalid request URL."
    }));
  }

  // HOME
  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200);

    return res.end(JSON.stringify({
      status: "online",
      service: "Ira AI Backend",
      health: "/health"
    }));
  }

  // HEALTH CHECK
  if (req.method === "GET" && pathname === "/health") {
    const providers = getConfiguredProviders();

    const configuredCount = providers.filter(
      provider => provider.configured
    ).length;

    res.writeHead(200);

    return res.end(JSON.stringify({
      status: "online",
      service: "Ira AI Backend",
      modelConfigured: configuredCount > 0,
      configuredProviderCount: configuredCount,
      providers
    }));
  }

  // CHAT API
  if (req.method !== "POST" || pathname !== "/api/chat") {
    res.writeHead(404);

    return res.end(JSON.stringify({
      error: "Endpoint not found."
    }));
  }

  try {
    const chunks = [];
    let totalSize = 0;

    for await (const chunk of req) {
      totalSize += chunk.length;

      if (totalSize > MAX_REQUEST_SIZE) {
        res.writeHead(413);

        return res.end(JSON.stringify({
          error: "Request too large."
        }));
      }

      chunks.push(chunk);
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      res.writeHead(400);

      return res.end(JSON.stringify({
        error: "Invalid JSON request."
      }));
    }

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      res.writeHead(400);

      return res.end(JSON.stringify({
        error: "Valid messages are required."
      }));
    }

    const messages = body.messages.map(message => {
      if (
        !message ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string"
      ) {
        throw new Error("Invalid message format.");
      }

      return {
        role: message.role,
        content: message.content
      };
    });

    const result = await generateAIResponse(messages);

    res.writeHead(200);

    return res.end(JSON.stringify(result.data));

  } catch (error) {
    console.error("Ira AI request failed:", error.message);

    const status =
      error.message.includes("No AI providers configured")
        ? 503
        : 502;

    res.writeHead(status);

    return res.end(JSON.stringify({
      error: "Ira could not complete the AI request."
    }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ira backend running on port ${PORT}`);
});
    
