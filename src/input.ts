import { DIALECTS } from "./dialects/index.js";
import type { HookInput } from "./schema.js";

export class HookParseError extends Error {
  override name = "HookParseError";
}

/**
 * Parse a raw stdin string (or an already-parsed object) into a typed,
 * event-tagged HookInput. Walks the dialect registry (see {@link DIALECTS}):
 * the first surface that recognizes the payload and can infer + parse its event
 * wins, normalizing every wire shape into the same canonical camelCase input
 * plus `event` and `dialect`.
 *
 * Throws HookParseError on malformed input or an unrecognizable event. Callers
 * that must never throw (e.g. fail-closed preToolUse) should use runHooks, which
 * catches for them.
 */
export const parseHookInput = (raw: string | object): HookInput => {
  let payload: unknown;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      throw new HookParseError("hook stdin was not valid JSON", { cause: err });
    }
  } else {
    payload = raw;
  }

  if (!payload || typeof payload !== "object") {
    throw new HookParseError("hook payload was not a JSON object");
  }

  const record = payload as Record<string, unknown>;

  for (const dialect of DIALECTS) {
    if (!dialect.detect(record)) continue;
    const event = dialect.inferEvent(record);
    if (!event) continue;
    const schema = dialect.schemaFor(event);
    if (!schema) continue; // this surface can't parse this event — try the next

    const result = schema.safeParse(payload);
    if (!result.success) {
      throw new HookParseError(
        `payload failed validation for ${event} (${dialect.name}): ${result.error.message}`,
      );
    }
    return {
      ...(result.data as object),
      event,
      dialect: dialect.name,
    } as HookInput;
  }

  throw new HookParseError("could not infer hook event from payload keys");
};

/**
 * Read the entire hook payload from a stream (default: process.stdin) and parse
 * it. The CLI sends one JSON object then closes stdin.
 */
export const readHookInput = async (
  stream: NodeJS.ReadStream = process.stdin,
): Promise<HookInput> => {
  const raw = await readStream(stream);
  return parseHookInput(raw);
};

const readStream = async (stream: NodeJS.ReadStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

/**
 * preToolUse/postToolUse tool args arrive on the wire as a JSON-encoded STRING.
 * Decode them safely; returns undefined if absent or unparseable (never throws).
 */
export const parseToolArgs = <T = unknown>(input: {
  toolArgs?: string;
}): T | undefined => {
  if (typeof input.toolArgs !== "string") return undefined;
  try {
    return JSON.parse(input.toolArgs) as T;
  } catch {
    return undefined;
  }
};
