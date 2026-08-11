import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: fromRoot("./popup.html"),
        library: fromRoot("./library.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
  },
});
