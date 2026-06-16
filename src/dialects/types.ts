import type { z } from "zod";
import type { HookDialect, HookEventName } from "../events.js";

/**
 * One wire surface that can deliver hook payloads (the Copilot CLI, VS Code,
 * and any future host). Each dialect owns three jobs end-to-end: recognizing its
 * own payloads, inferring the event, and supplying the zod schema that parses +
 * normalizes that event into the canonical camelCase {@link HookInput} shape.
 *
 * `parseHookInput` walks the registry in order and uses the first dialect that
 * both `detect`s the payload and can `inferEvent` + `schemaFor` it, so the
 * surfaces never share parsing logic.
 */
export interface Dialect {
  /** Canonical name, surfaced on the parsed input as `dialect`. */
  readonly name: HookDialect;
  /** True when a raw payload looks like it came from this surface. */
  detect(payload: Record<string, unknown>): boolean;
  /** The canonical event for this payload, or undefined if undeterminable. */
  inferEvent(payload: Record<string, unknown>): HookEventName | undefined;
  /** The schema that parses + normalizes `event`, or undefined if unsupported. */
  schemaFor(event: HookEventName): z.ZodType | undefined;
}
