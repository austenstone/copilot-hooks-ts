import { inferEventName } from "./events.js";
import { schemaByEvent, type HookInput } from "./schema.js";

export class HookParseError extends Error {
  override name = "HookParseError";
}

/**
 * Parse a raw stdin string (or an already-parsed object) into a typed,
 * event-tagged HookInput. Throws HookParseError on malformed input or an
 * unrecognizable event. Callers that must never throw (e.g. fail-closed
 * preToolUse) should use runHooks, which catches for them.
 */
export function parseHookInput(raw: string | object): HookInput {
  let payload: unknown;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HookParseError("hook stdin was not valid JSON");
    }
  } else {
    payload = raw;
  }

  if (!payload || typeof payload !== "object") {
    throw new HookParseError("hook payload was not a JSON object");
  }

  const event = inferEventName(payload as Record<string, unknown>);
  if (!event) {
    throw new HookParseError(
      "could not infer hook event from payload keys",
    );
  }

  const result = schemaByEvent[event].safeParse(payload);
  if (!result.success) {
    throw new HookParseError(
      `payload failed validation for ${event}: ${result.error.message}`,
    );
  }

  return { ...result.data, event } as HookInput;
}

/**
 * Read the entire hook payload from a stream (default: process.stdin) and
 * parse it. The CLI sends one JSON object then closes stdin.
 */
export async function readHookInput(
  stream: NodeJS.ReadStream = process.stdin,
): Promise<HookInput> {
  const raw = await readStream(stream);
  return parseHookInput(raw);
}

async function readStream(stream: NodeJS.ReadStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Tool args arrive on the wire as a JSON-encoded STRING. Decode them safely;
 * returns undefined if absent or unparseable (never throws).
 */
export function parseToolArgs<T = unknown>(input: {
  toolArgs?: string;
}): T | undefined {
  if (typeof input.toolArgs !== "string") return undefined;
  try {
    return JSON.parse(input.toolArgs) as T;
  } catch {
    return undefined;
  }
}
