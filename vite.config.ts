import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "0.0.0.0",
    port: 5000,
    hmr: {
      overlay: false,
    },
    allowedHosts: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Use env vars — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env / CI secrets
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL ?? "https://ylbuuvimelaariosriwk.supabase.co"),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsYnV1dmltZWxhYXJpb3NyaXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTE1MjksImV4cCI6MjA4NTIyNzUyOX0.G9bmLzE2ScnNJAJvZm1ApuwzDeT-G23k7MbP1V0W-zY"),
  },
}));
