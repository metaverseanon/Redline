import Anthropic from "@anthropic-ai/sdk";

// Lazily instantiate the Anthropic client backed by the Replit AI Integrations
// proxy. We intentionally return `null` (instead of throwing at import time like
// the integration template) so the server still boots and AI features can
// degrade gracefully when the proxy env vars are absent.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey, baseURL });
  }
  return client;
}

export function isAnthropicConfigured(): boolean {
  return (
    !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
    !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  );
}

export const COACH_MODEL = "claude-sonnet-4-6";

/**
 * Extract the first balanced JSON object from a model response. Models
 * occasionally wrap JSON in prose or ```json fences, so we scan for the first
 * `{` and walk to its matching `}` (string-aware) instead of trusting the whole
 * string to be valid JSON.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model response");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        return JSON.parse(slice);
      }
    }
  }
  throw new Error("Unterminated JSON object in model response");
}
