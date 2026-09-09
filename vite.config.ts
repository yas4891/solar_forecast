import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/solar-forecast-card.ts",
      formats: ["es"],
      fileName: () => "solar_forecast.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
