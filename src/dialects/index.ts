import { nativeDialect } from "./native.js";
import type { Dialect } from "./types.js";
import { vscodeDialect } from "./vscode.js";

/**
 * The wire surfaces `parseHookInput` will try, in order. VS Code is checked
 * first because it carries a clear snake_case discriminator (`session_id`);
 * native is last because it claims everything else.
 */
export const DIALECTS: readonly Dialect[] = [vscodeDialect, nativeDialect];

export { nativeDialect } from "./native.js";
export type { Dialect } from "./types.js";
export { vscodeDialect } from "./vscode.js";
