import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 14900,
    strictPort: true,
  },
  preview: {
    port: 14900,
    strictPort: true,
  },
});
