import { compatSchemaByEvent } from "./compat.js";
import { detectDialect, inferEventName } from "./events.js";
import { type HookInput, nativeSchemaByEvent } from "./schema.js";

export class HookParseError extends Error {
  override name = "HookParseError";
}

/**
 * Parse a raw stdin string (or an already-parsed object) into a typed,
 * event-tagged HookInput. Auto-detects the wire dialect (native camelCase vs VS
 * Code snake_case) and normalizes both into the same canonical shape, so the
 * returned input always has camelCase fields plus `event` and `dialect`.
 *
 * Throws HookParseError on malformed input or an unrecognizable event. Callers
 * that must never throw (e.g. fail-closed preToolUse) should use runHooks, which
 * catches for them.
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

  const record = payload as Record<string, unknown>;
  const event = inferEventName(record);
  if (!event) {
    throw new HookParseError("could not infer hook event from payload keys");
  }

  const dialect = detectDialect(record, event);
  const schema =
    dialect === "vscode"
      ? (compatSchemaByEvent[event] ?? nativeSchemaByEvent[event])
      : nativeSchemaByEvent[event];

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HookParseError(
      `payload failed validation for ${event} (${dialect}): ${result.error.message}`,
    );
  }

  return { ...(result.data as object), event, dialect } as HookInput;
}

/**
 * Read the entire hook payload from a stream (default: process.stdin) and parse
 * it. The CLI sends one JSON object then closes stdin.
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
 * preToolUse/postToolUse tool args arrive on the wire as a JSON-encoded STRING.
 * Decode them safely; returns undefined if absent or unparseable (never throws).
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
