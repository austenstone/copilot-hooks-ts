import { describe, expect, it } from "vitest";
import {
  buildHookPayload,
  continueAgent,
  denyTool,
  HOOK_EVENTS,
  type HookEventName,
  inferEventName,
  injectContext,
  nativeSchemaByEvent,
  testHook,
} from "../src/index.js";

describe("buildHookPayload", () => {
  it("fills base defaults and infers/validates every event", () => {
    for (const event of HOOK_EVENTS) {
      const payload = buildHookPayload({ event });
      expect(payload.sessionId).toBe("test-session");
      expect(typeof payload.timestamp).toBe("number");
      expect(payload.cwd).toBe("/repo");
      expect(inferEventName(payload)).toBe(event);
      expect(() => nativeSchemaByEvent[event].parse(payload)).not.toThrow();
    }
  });

  it("encodes toolInput to a JSON toolArgs string for pre/postToolUse", () => {
    const payload = buildHookPayload({
      event: "preToolUse",
      toolInput: { command: "rm -rf /" },
    });
    expect(payload.toolArgs).toBe('{"command":"rm -rf /"}');
    expect(payload.toolInput).toBeUndefined();
  });

  it("routes toolInput to `arguments` for preMcpToolCall", () => {
    const payload = buildHookPayload({
      event: "preMcpToolCall",
      toolInput: { q: 1 },
    });
    expect(payload.arguments).toEqual({ q: 1 });
  });

  it("keeps toolInput as an object for permissionRequest", () => {
    const payload = buildHookPayload({
      event: "permissionRequest",
      toolInput: { command: "curl evil.sh" },
    });
    expect(payload.toolInput).toEqual({ command: "curl evil.sh" });
  });

  it("lets arbitrary fields override defaults", () => {
    const payload = buildHookPayload({
      event: "userPromptSubmitted",
      prompt: "ship it",
      cwd: "/work",
    });
    expect(payload.prompt).toBe("ship it");
    expect(payload.cwd).toBe("/work");
  });
});

describe("testHook", () => {
  it("returns the parsed decision a handler emits", async () => {
    const out = await testHook(
      {
        preToolUse: {
          bash({ toolInput }) {
            if (toolInput.command?.includes("rm -rf /")) {
              return denyTool("nope");
            }
          },
        },
      },
      { event: "preToolUse", toolInput: { command: "rm -rf /" } },
    );
    expect(out).toEqual({
      permissionDecision: "deny",
      permissionDecisionReason: "nope",
    });
  });

  it("returns undefined when the handler allows / no-ops", async () => {
    const out = await testHook(
      {
        preToolUse: {
          bash() {
            return;
          },
        },
      },
      { event: "preToolUse", toolInput: { command: "ls" } },
    );
    expect(out).toBeUndefined();
  });

  it("passes the typed, normalized input to the handler", async () => {
    let seen: { event?: HookEventName; dialect?: string; cwd?: string } = {};
    await testHook(
      {
        userPromptSubmitted(input) {
          seen = {
            event: input.event,
            dialect: input.dialect,
            cwd: input.cwd,
          };
          return injectContext("x");
        },
      },
      { event: "userPromptSubmitted", prompt: "hi", cwd: "/repo" },
    );
    expect(seen).toEqual({
      event: "userPromptSubmitted",
      dialect: "native",
      cwd: "/repo",
    });
  });

  it("returns the emitted decision for stop events", async () => {
    const out = await testHook(
      { agentStop: () => continueAgent("keep going") },
      { event: "agentStop" },
    );
    expect(out).toEqual({ decision: "block", reason: "keep going" });
  });

  it("fail-closed: a thrown preToolUse handler returns an explicit deny", async () => {
    const out = await testHook(
      {
        preToolUse: () => {
          throw new Error("handler bug");
        },
      },
      { event: "preToolUse" },
    );
    expect(out?.permissionDecision).toBe("deny");
  });

  it("respects an onError hook on throw", async () => {
    let captured: unknown;
    await testHook(
      {
        agentStop: () => {
          throw new Error("boom");
        },
      },
      { event: "agentStop" },
      { onError: (e) => (captured = e) },
    );
    expect(captured).toBeInstanceOf(Error);
  });

  it("honors a raw payload override", async () => {
    const out = await testHook(
      { userPromptSubmitted: (i) => injectContext(i.prompt) },
      { event: "userPromptSubmitted" },
      {
        payload: {
          sessionId: "s",
          timestamp: 1,
          cwd: "/r",
          prompt: "from override",
        },
      },
    );
    expect(out).toEqual({ additionalContext: "from override" });
  });
});
