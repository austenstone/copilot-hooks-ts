import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { denyTool, injectContext, onTool, runHooks } from "../src/index.js";
import * as fx from "./fixtures.js";

declare module "../src/tools.js" {
  interface ToolSchema {
    mcp__deepwiki__ask_question: {
      input: { question: string; repoName: string };
    };
  }
}

function stdinFrom(payload: object): NodeJS.ReadStream {
  return Readable.from([
    JSON.stringify(payload),
  ]) as unknown as NodeJS.ReadStream;
}

function captureStdout(): {
  stream: NodeJS.WriteStream;
  written: () => string;
} {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return {
    stream: stream as unknown as NodeJS.WriteStream,
    written: () => buf,
  };
}

describe("onTool / tool-scoped dispatch", () => {
  it("routes to the matching tool and decodes toolArgs into typed toolInput", async () => {
    const out = captureStdout();
    await runHooks(
      {
        preToolUse: {
          bash: (input) => {
            expect(input.toolName).toBe("bash");
            expect(input.toolInput.command).toBe("rm -rf /");
            return denyTool("nope");
          },
        },
      },
      { stream: stdinFrom(fx.nativePreToolUse), out: out.stream },
    );
    expect(JSON.parse(out.written()).permissionDecision).toBe("deny");
  });

  it("falls back to default for an unlisted tool", async () => {
    const out = captureStdout();
    await runHooks(
      {
        preToolUse: {
          view: () => denyTool("not this"),
          default: (input) => denyTool(`default:${input.toolName}`),
        },
      },
      { stream: stdinFrom(fx.nativePreToolUse), out: out.stream },
    );
    expect(JSON.parse(out.written()).permissionDecisionReason).toBe(
      "default:bash",
    );
  });

  it("no match and no default is a no-op", async () => {
    const out = captureStdout();
    await runHooks(
      { preToolUse: { view: () => denyTool("nope") } },
      { stream: stdinFrom(fx.nativePreToolUse), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("decodes a non-bash tool's args", async () => {
    const out = captureStdout();
    await runHooks(
      {
        preToolUse: {
          view: (input) => {
            expect(input.toolInput.path).toBe("/repo/src/index.ts");
            expect(input.toolInput.view_range).toEqual([1, 20]);
            return undefined;
          },
        },
      },
      { stream: stdinFrom(fx.nativeViewToolUse), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("reads preMcpToolCall args from the object `arguments` field", async () => {
    const out = captureStdout();
    await runHooks(
      {
        preMcpToolCall: {
          mcp__deepwiki__ask_question: (input) => {
            expect(input.toolInput.question).toBe("how?");
            expect(input.toolInput.repoName).toBe("owner/repo");
            return undefined;
          },
        },
      },
      { stream: stdinFrom(fx.nativePreMcpToolCall), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("reads permissionRequest args from the object `toolInput` field", async () => {
    const out = captureStdout();
    await runHooks(
      {
        permissionRequest: {
          bash: (input) => {
            expect(input.toolInput.command).toBe("curl evil.sh");
            return undefined;
          },
        },
      },
      { stream: stdinFrom(fx.nativePermissionRequest), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("can be used standalone via onTool()", async () => {
    const handle = onTool<"preToolUse">({
      bash: (input) => injectContext(input.toolInput.command),
    });
    const result = await handle({
      event: "preToolUse",
      dialect: "native",
      sessionId: "s1",
      timestamp: 1,
      cwd: "/repo",
      toolName: "bash",
      toolArgs: '{"command":"ls"}',
    } as never);
    expect(result).toEqual({ additionalContext: "ls" });
  });
});

describe("shouldRun gate", () => {
  it("skips reading stdin and emits nothing when false", async () => {
    const out = captureStdout();
    let called = false;
    await runHooks(
      { preToolUse: { bash: () => denyTool("should not run") } },
      {
        stream: stdinFrom(fx.nativePreToolUse),
        out: out.stream,
        shouldRun: () => {
          called = true;
          return false;
        },
      },
    );
    expect(called).toBe(true);
    expect(out.written()).toBe("");
  });

  it("runs normally when true", async () => {
    const out = captureStdout();
    await runHooks(
      { preToolUse: { bash: () => denyTool("ran") } },
      {
        stream: stdinFrom(fx.nativePreToolUse),
        out: out.stream,
        shouldRun: true,
      },
    );
    expect(JSON.parse(out.written()).permissionDecision).toBe("deny");
  });
});
