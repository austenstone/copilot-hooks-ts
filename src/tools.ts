import type { HookResult } from "./runner.js";
import type {
  PermissionRequestInput,
  PostToolUseFailureInput,
  PostToolUseInput,
  PreMcpToolCallInput,
  PreToolUseInput,
} from "./schema.js";

// Built-in input shapes for the native Copilot CLI tools, verified against
// copilot-agent-runtime (`src/tools/`). These are the args you get back on the
// preToolUse / postToolUse wire as the JSON-decoded `toolInput`.

export interface ShellInput {
  command: string;
  description?: string;
  shellId?: string;
  mode?: "sync" | "async";
  detach?: boolean;
  initial_wait?: number;
}

export interface ViewInput {
  path: string;
  view_range?: number[];
}

export interface CreateInput {
  path: string;
  file_text: string;
}

export interface StrReplaceInput {
  path: string;
  old_str?: string;
  new_str?: string;
}

export interface InsertInput {
  path: string;
  insert_line: number;
  new_str: string;
}

export interface GlobInput {
  pattern: string;
  paths?: string | string[];
}

export interface GrepInput {
  pattern: string;
  path?: string;
  paths?: string | string[];
  output_mode?: "content" | "files_with_matches" | "count";
  glob?: string;
  type?: string;
  multiline?: boolean;
  head_limit?: number;
  "-i"?: boolean;
  "-n"?: boolean;
  "-A"?: number;
  "-B"?: number;
  "-C"?: number;
}

/**
 * Maps a tool name to the shape of its decoded input. Augment it with
 * declaration merging to type your own (or MCP) tools:
 *
 * ```ts
 * declare module "copilot-hooks-ts" {
 *   interface ToolSchema {
 *     "mcp__deepwiki__ask_question": { input: { question: string; repoName: string } };
 *   }
 * }
 * ```
 *
 * The runtime emits MCP tools as `mcp__<server>__<tool>`.
 */
export interface ToolSchema {
  bash: { input: ShellInput };
  powershell: { input: ShellInput };
  local_shell: { input: ShellInput };
  view: { input: ViewInput };
  create: { input: CreateInput };
  edit: { input: StrReplaceInput };
  str_replace_editor: {
    input:
      | (ViewInput & { command: "view" })
      | (CreateInput & { command: "create" })
      | (StrReplaceInput & { command: "str_replace" | "edit" })
      | (InsertInput & { command: "insert" });
  };
  glob: { input: GlobInput };
  grep: { input: GrepInput };
}

export type ToolName = keyof ToolSchema & string;

/** The decoded input for a tool name; unknown tools fall back to a loose record. */
export type ToolInputOf<Name extends string> = Name extends keyof ToolSchema
  ? ToolSchema[Name]["input"]
  : Record<string, unknown>;

/** Events whose payload carries a `toolName` you can scope on. */
export type ToolEvent =
  | "preToolUse"
  | "postToolUse"
  | "postToolUseFailure"
  | "preMcpToolCall"
  | "permissionRequest";

export type ToolEventInput<E extends ToolEvent> = E extends "preToolUse"
  ? PreToolUseInput
  : E extends "postToolUse"
    ? PostToolUseInput
    : E extends "postToolUseFailure"
      ? PostToolUseFailureInput
      : E extends "preMcpToolCall"
        ? PreMcpToolCallInput
        : PermissionRequestInput;

/** The per-event input, narrowed to one tool and carrying a typed `toolInput`. */
export type ToolScopedInput<
  E extends ToolEvent,
  Name extends string,
> = ToolEventInput<E> & {
  toolName: Name;
  toolInput: ToolInputOf<Name>;
};

export type ToolHandler<E extends ToolEvent, Name extends string> = (
  input: ToolScopedInput<E, Name>,
) => HookResult | Promise<HookResult>;

/**
 * A map from tool name to a tool-scoped handler, plus an optional `default` for
 * any tool without an explicit entry. Keys are checked against `ToolSchema`, so
 * augment it to scope to custom / MCP tools.
 */
export type ToolHandlerMap<E extends ToolEvent> = {
  [Name in keyof ToolSchema]?: ToolHandler<E, Name & string>;
} & {
  default?: ToolHandler<E, string>;
};

const decodeToolInput = (input: Record<string, unknown>): unknown => {
  if ("toolArgs" in input) {
    const raw = input.toolArgs;
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if ("arguments" in input) return input.arguments;
  if ("toolInput" in input) return input.toolInput;
  return undefined;
};

/**
 * Turns a tool-scoped handler map into a single event handler: it decodes the
 * tool input, picks the handler matching `input.toolName` (falling back to
 * `default`), and calls it with a typed, narrowed input. No match and no
 * `default` means no-op (allow). Use it standalone, or just pass the map
 * directly as a `runHooks` value for a tool event.
 */
export const onTool = <E extends ToolEvent>(
  handlers: ToolHandlerMap<E>,
): ((input: ToolEventInput<E>) => HookResult | Promise<HookResult>) => {
  const table = handlers as Record<string, ToolHandler<E, string> | undefined>;
  return (input) => {
    const record = input as unknown as Record<string, unknown>;
    const handler = table[input.toolName] ?? handlers.default;
    if (!handler) return undefined;
    const scoped = {
      ...input,
      toolInput: decodeToolInput(record),
    } as ToolScopedInput<E, string>;
    return handler(scoped);
  };
};
