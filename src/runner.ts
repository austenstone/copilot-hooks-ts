import type { HookEventName } from "./events.js";
import { readHookInput } from "./input.js";
import { emit, type HookOutput } from "./output.js";
import type { HookInput, HookInputFor } from "./schema.js";

/**
 * What a handler may return: a decision object to emit, or nothing
 * (null/undefined/void) to allow / no-op. May be sync or async.
 */
export type HookResult = HookOutput | null | undefined | void;

export type HookHandler<E extends HookEventName> = (
  input: HookInputFor<E>,
) => HookResult | Promise<HookResult>;

export type HookHandlers = {
  [E in HookEventName]?: HookHandler<E>;
};

export interface RunHooksOptions {
  /** Read the payload from here instead of process.stdin. */
  stream?: NodeJS.ReadStream;
  /** Write the decision here instead of process.stdout. */
  out?: NodeJS.WriteStream;
  /**
   * Called if anything throws (bad JSON, handler error). Hooks are fail-safe:
   * after this runs, runHooks still resolves without emitting. Use it to log
   * to stderr. Do NOT re-throw.
   */
  onError?: (err: unknown) => void;
}

/**
 * The ergonomic entry point: read + parse stdin, dispatch to the handler for
 * the inferred event, and emit whatever it returns. Handlers that return
 * void/null emit nothing (allow / no-op).
 *
 * Fail-safe by design: any error is routed to onError and swallowed, so a hook
 * never crashes out. (For fail-closed preToolUse, return denyTool() explicitly
 * rather than relying on a throw.)
 */
export async function runHooks(
  handlers: HookHandlers,
  options: RunHooksOptions = {},
): Promise<void> {
  try {
    const input = await readHookInput(options.stream ?? process.stdin);
    const handler = handlers[input.event] as
      | ((i: HookInput) => ReturnType<HookHandler<HookEventName>>)
      | undefined;
    if (!handler) return;
    const output = await handler(input);
    if (output) emit(output, options.out ?? process.stdout);
  } catch (err) {
    options.onError?.(err);
  }
}
