import { defineConfig } from "vite";

const fromRoot = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/assets",
    emptyOutDir: false,
    lib: {
      entry: fromRoot("./src/background.ts"),
      formats: ["iife"],
      name: "JingjiBackground",
      fileName: () => "background.js",
    },
  },
});
