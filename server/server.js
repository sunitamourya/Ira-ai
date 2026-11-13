
import http from "node:http";

const PORT = Number(process.env.PORT || 3000);

const AI_API_URL = process.env.AI_API_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL;

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "*";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const pathname = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  ).pathname.replace(/\/+$/, "") || "/";

  // ROOT STATUS
  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      status: "online",
      service: "Ira AI Backend",
      health: "/health"
    }));
  }

  // HEALTH CHECK
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      status: "online",
      service: "Ira AI Backend",
      modelConfigured: Boolean(
        AI_API_URL && AI_API_KEY && AI_MODEL
      )
    }));
  }

  // CHAT ENDPOINT
  if (req.method !== "POST" || pathname !== "/api/chat") {
    res.writeHead(404, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      error: "Endpoint not found."
    }));
  }

  try {
    if (!AI_API_URL || !AI_API_KEY || !AI_MODEL) {
      res.writeHead(503, {
        "Content-Type": "application/json"
      });

      return res.end(JSON.stringify({
        error: "AI provider is not configured yet."
      }));
    }

    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(
      Buffer.concat(chunks).toString("utf8")
    );

    if (!Array.isArray(body.messages)) {
      throw new Error("Invalid messages format.");
    }

    const messages = body.messages.map(message => {
      if (
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string"
      ) {
        throw new Error("Invalid message entry.");
      }

      return {
        role: message.role,
        content: message.content
      };
    });

    const upstream = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages
      })
    });

    const result = await upstream.text();

    res.writeHead(upstream.status, {
      "Content-Type": "application/json"
    });

    return res.end(result);

  } catch (error) {
    console.error("Ira backend error:", error.message);

    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      error: "Ira could not complete the AI request."
    }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ira backend running on port ${PORT}`);
});
                                 
