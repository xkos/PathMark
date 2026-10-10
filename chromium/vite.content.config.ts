import { defineConfig } from "vite";
export default defineConfig({ publicDir: false, build: {
  outDir: "dist/assets", emptyOutDir: false,
  lib: { entry: new URL("./src/content/link-markers.ts", import.meta.url).pathname, formats: ["iife"], name: "PathmarkLinks", fileName: () => "link-markers.js" },
} });
