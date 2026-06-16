import { inferEventName } from "../events.js";
import { nativeSchemaByEvent } from "../schema.js";
import type { Dialect } from "./types.js";

/**
 * The Copilot CLI surface. Wire payloads are already in the canonical camelCase
 * shape (epoch-ms `timestamp`, JSON-string `toolArgs`, camelCase `sessionId`),
 * so the native schemas validate rather than transform. This is the fallback
 * dialect: `detect` always returns true, so any payload no other dialect claims
 * is parsed here.
 */
export const nativeDialect: Dialect = {
  name: "native",
  detect: () => true,
  inferEvent: (payload) => inferEventName(payload),
  schemaFor: (event) => nativeSchemaByEvent[event],
};
