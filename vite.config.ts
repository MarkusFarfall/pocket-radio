import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const radioGardenProxy = {
  target: "https://radio.garden",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/radio-garden/, "/api"),
};

const radioBrowserProxy = {
  target: "https://all.api.radio-browser.info",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/radio-browser/, ""),
  headers: { "User-Agent": "PocketRadio/1.0 (radio discovery)" },
};

function rewriteArchiveFile(path: string): string {
  const url = new URL(path, "http://vite.local");
  if (url.pathname !== "/api/archive-file") return path;
  const identifier = url.searchParams.get("identifier") ?? "";
  const file = url.searchParams.get("file") ?? "";
  if (!identifier || !file) return path;
  const encodedFile = file.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `/download/${encodeURIComponent(identifier)}/${encodedFile}`;
}

const archiveFileProxy = {
  target: "https://archive.org",
  changeOrigin: true,
  // Archive.org redirects file downloads to CDN hosts; follow server-side to keep the browser same-origin.
  followRedirects: true,
  secure: true,
  rewrite: rewriteArchiveFile,
};

const proxy = {
  "/api/radio-browser": radioBrowserProxy,
  "/api/radio-garden": radioGardenProxy,
  "/api/archive-file": archiveFileProxy,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy,
  },
});
