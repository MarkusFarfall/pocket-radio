import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const radioGardenProxy = {
  target: "https://radio.garden",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/radio-garden/, "/api"),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: { "/api/radio-garden": radioGardenProxy },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: { "/api/radio-garden": radioGardenProxy },
  },
});
