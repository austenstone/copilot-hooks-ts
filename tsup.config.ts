import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  // @github/copilot-sdk is a type-only dependency; it must never end up in the
  // runtime bundle. Mark external so any accidental value import fails loudly.
  external: ["@github/copilot-sdk"],
});
