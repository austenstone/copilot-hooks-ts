import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { SessionEvent } from "@github/copilot-sdk";

// Typed reader for a session transcript (events.jsonl). The line-delimited JSON
// is the same SessionEvent union the runtime streams, so consumers get full
// types for free. agentStop hooks receive the transcript path on the wire
// (`transcriptPath`); pass it straight in here.

/** Stream events from a transcript file, skipping blank/malformed lines. */
export async function* streamTranscript(
  path: string,
): AsyncGenerator<SessionEvent> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as SessionEvent;
    } catch {
      // skip a partially-written or corrupt line rather than throwing
    }
  }
}

/** Read an entire transcript into memory as a typed event array. */
export async function loadTranscript(path: string): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  for await (const event of streamTranscript(path)) events.push(event);
  return events;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  /** undefined when the call had no matching completion event. */
  success: boolean | undefined;
  error: unknown;
}

/**
 * Join `tool.execution_start` events to their `tool.execution_complete` by
 * toolCallId, preserving start order. This is the core primitive for asking
 * "what tools actually ran, and did they succeed?".
 */
export function joinToolCalls(events: readonly SessionEvent[]): ToolCall[] {
  const starts = new Map<string, { toolName: string; arguments: unknown }>();
  const order: string[] = [];
  const completes = new Map<string, { success: boolean; error: unknown }>();

  for (const event of events) {
    if (event.type === "tool.execution_start") {
      const data = event.data;
      if (!starts.has(data.toolCallId)) order.push(data.toolCallId);
      starts.set(data.toolCallId, {
        toolName: data.toolName,
        arguments: data.arguments,
      });
    } else if (event.type === "tool.execution_complete") {
      const data = event.data;
      completes.set(data.toolCallId, {
        success: data.success,
        error: data.error,
      });
    }
  }

  return order.map((id) => {
    const start = starts.get(id) as { toolName: string; arguments: unknown };
    const complete = completes.get(id);
    return {
      toolCallId: id,
      toolName: start.toolName,
      arguments: start.arguments,
      success: complete?.success,
      error: complete?.error,
    };
  });
}

/** Tool calls whose completion reported success. */
export function successfulToolCalls(
  events: readonly SessionEvent[],
): ToolCall[] {
  return joinToolCalls(events).filter((call) => call.success === true);
}

/** Names of all skills invoked in the transcript (e.g. to detect a workflow). */
export function skillNames(events: readonly SessionEvent[]): string[] {
  const names: string[] = [];
  for (const event of events) {
    if (event.type === "skill.invoked") names.push(event.data.name);
  }
  return names;
}
