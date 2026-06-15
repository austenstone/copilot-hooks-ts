import { FAIL_CLOSED_EVENTS, type HookEventName } from "./events.js";
import { readHookInput } from "./input.js";
import { denyPermission, denyTool, emit, type HookOutput } from "./output.js";
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
   * Called if anything throws (bad JSON, handler error). Use it to log to
   * stderr. Do NOT re-throw.
   */
  onError?: (err: unknown) => void;
  /**
   * Fail-closed behavior for preToolUse and permissionRequest. When true
   * (default), a handler error emits an explicit deny so a crashing hook can't
   * silently allow the action. Set false to fail open (emit nothing).
   */
  failClosed?: boolean;
  /** Override how the process exit code is set (defaults to process.exitCode). */
  setExitCode?: (code: number) => void;
}

const FAIL_CLOSED = new Set<HookEventName>(FAIL_CLOSED_EVENTS);

function failClosedOutput(event: HookEventName): HookOutput | undefined {
  if (event === "preToolUse")
    return denyTool("preToolUse hook errored; denying for safety");
  if (event === "permissionRequest")
    return denyPermission("permissionRequest hook errored; denying for safety");
  return undefined;
}

/**
 * The ergonomic entry point: read + parse stdin, dispatch to the handler for the
 * inferred event, and emit whatever it returns. Handlers that return void/null
 * emit nothing (allow / no-op).
 *
 * Fail-closed by default for preToolUse and permissionRequest: if the handler
 * throws, an explicit deny is emitted (and the exit code is set) so a buggy hook
 * cannot silently allow a gated action. All other events are fail-safe — errors
 * are routed to onError and swallowed without emitting.
 */
export async function runHooks(
  handlers: HookHandlers,
  options: RunHooksOptions = {},
): Promise<void> {
  const out = options.out ?? process.stdout;
  const failClosed = options.failClosed ?? true;
  const setExitCode =
    options.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });

  let input: HookInput;
  try {
    input = await readHookInput(options.stream ?? process.stdin);
  } catch (err) {
    options.onError?.(err);
    // Event is unknown here, so we can't emit a correctly-shaped deny. Exit
    // nonzero so a preToolUse-wired script still fails closed via the runtime.
    if (failClosed) setExitCode(1);
    return;
  }

  const handler = handlers[input.event] as
    | ((i: HookInput) => ReturnType<HookHandler<HookEventName>>)
    | undefined;
  if (!handler) return;

  try {
    const output = await handler(input);
    if (output) emit(output, out);
  } catch (err) {
    options.onError?.(err);
    if (failClosed && FAIL_CLOSED.has(input.event)) {
      const deny = failClosedOutput(input.event);
      if (deny) emit(deny, out);
    }
  }
}
