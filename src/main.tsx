import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeUnityAds } from "./lib/unityAds.ts";

// Start Unity Ads SDK initialization immediately — before React mounts.
// This gives the SDK maximum time to load ads before the user taps anything.
// The function is idempotent (runs only once) and safe on web (no-op).
initializeUnityAds();

createRoot(document.getElementById("root")!).render(<App />);
