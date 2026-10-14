import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/__llm-prototype/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/llm-prototype",
    rollupOptions: {
      input: "prototypes/llm-activity.html",
      output: { entryFileNames: "assets/llm-activity.js", assetFileNames: "assets/[name][extname]" },
    },
  },
});
