import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CLIENT_TOKENS = (process.env.STUDY_GLASS_CLIENT_TOKENS || process.env.STUDY_GLASS_CLIENT_TOKEN || "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);
const ALLOW_UNAUTHENTICATED = process.env.STUDY_GLASS_ALLOW_UNAUTHENTICATED === "true";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MODEL_DEFAULT = process.env.OPENAI_MODEL_DEFAULT || "gpt-4.1-mini";

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_TEXT_CHARS = 36_000;
const MAX_REFERENCE_IMAGES = 3;
const MAX_OUTPUT_TOKENS = 220;
const OPENAI_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;

const rateBuckets = new Map();

function assertProductionConfig() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  if (!CLIENT_TOKENS.length && !ALLOW_UNAUTHENTICATED) {
    throw new Error(
      "STUDY_GLASS_CLIENT_TOKEN or STUDY_GLASS_CLIENT_TOKENS is required. Set STUDY_GLASS_ALLOW_UNAUTHENTICATED=true only for local development.",
    );
  }

  if (process.env.NODE_ENV === "production" && ALLOWED_ORIGIN === "*") {
    throw new Error("ALLOWED_ORIGIN must be set to a concrete origin in production.");
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Vary": "Origin",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  response.end(JSON.stringify(body));
}

function trimChars(value, maxChars) {
  return Array.from(String(value || "")).slice(0, maxChars).join("");
}

function clientIp(request) {
  if (TRUST_PROXY) {
    return request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}

function rateLimitKey(request) {
  const auth = request.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return `token:${auth.slice("Bearer ".length, "Bearer ".length + 18)}`;
  }
  return `ip:${clientIp(request)}`;
}

function checkRateLimit(request) {
  const key = rateLimitKey(request);
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= RATE_MAX_REQUESTS;
}

function authorize(request) {
  if (!CLIENT_TOKENS.length) return ALLOW_UNAUTHENTICATED;
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length);
  return CLIENT_TOKENS.includes(token);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateDataUrl(label, value) {
  if (typeof value !== "string" || !/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    throw new Error(`${label} must be a base64 JPEG, PNG, or WebP data URL.`);
  }

  if (value.length > MAX_IMAGE_DATA_URL_BYTES) {
    throw new Error(`${label} is too large.`);
  }
}

function buildPrompt(payload) {
  const prompt = String(payload.prompt || "").trim();
  const referenceText = trimChars(payload.referenceText, MAX_REFERENCE_TEXT_CHARS);

  if (!referenceText.trim()) {
    return `Answer quickly and concisely. If the image contains math, read formulas, symbols, exponents, fractions, and signs carefully before answering. If a formula is unclear, say which part is unreadable instead of guessing.\n\nUser prompt: ${prompt}`;
  }

  return `Answer quickly and concisely. Use the reference files only when they help. If the image contains math, read formulas, symbols, exponents, fractions, and signs carefully before answering. If a formula is unclear, say which part is unreadable instead of guessing.\n\nReference files:\n${referenceText}\n\nUser prompt: ${prompt}`;
}

function extractOutputText(body) {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  return (body.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function askOpenAI(payload) {
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  validateDataUrl("imageDataUrl", payload.imageDataUrl);

  const referenceImages = Array.isArray(payload.referenceImages)
    ? payload.referenceImages.slice(0, MAX_REFERENCE_IMAGES)
    : [];

  for (const image of referenceImages) {
    validateDataUrl(`reference image ${image.name || ""}`.trim(), image.imageDataUrl);
  }

  const content = [
    {
      type: "input_text",
      text: buildPrompt(payload),
    },
    {
      type: "input_image",
      image_url: payload.imageDataUrl,
      detail: "high",
    },
    ...referenceImages.map((image) => ({
      type: "input_image",
      image_url: image.imageDataUrl,
      detail: "high",
    })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: String(payload.model || MODEL_DEFAULT).trim() || MODEL_DEFAULT,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        input: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    const responseText = await openaiResponse.text();
    if (!openaiResponse.ok) {
      const requestId = openaiResponse.headers.get("x-request-id") || "unknown";
      console.error(
        JSON.stringify({
          level: "error",
          event: "openai_error",
          status: openaiResponse.status,
          requestId,
          body: responseText.slice(0, 2_000),
        }),
      );
      throw new Error(`LLM request failed. request_id=${requestId}`);
    }

    const responseBody = JSON.parse(responseText);
    const answer = extractOutputText(responseBody);
    if (!answer) {
      throw new Error("OpenAI response did not include text output.");
    }

    return {
      answer,
      model: String(payload.model || MODEL_DEFAULT).trim() || MODEL_DEFAULT,
      capturedAt: new Date().toISOString(),
      trigger: payload.trigger || "app_button",
      usedFallback: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/ask") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (!authorize(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  if (!checkRateLimit(request)) {
    sendJson(response, 429, { error: "Rate limit exceeded" });
    return;
  }

  try {
    const payload = await readBody(request);
    const result = await askOpenAI(payload);
    sendJson(response, 200, result);
  } catch (error) {
    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        requestId,
        message: String(error.message || error),
      }),
    );
    sendJson(response, 400, { error: `Request failed. request_id=${requestId}` });
  }
});

assertProductionConfig();

server.listen(PORT, () => {
  console.log(`Study Glass API listening on :${PORT}`);
});
