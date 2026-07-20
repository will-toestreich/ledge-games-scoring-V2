import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { registerSW } from "virtual:pwa-register";

// Long-lived screens (the TV, scorers' phones) must pick up new deploys on
// their own: check for an updated service worker every minute — autoUpdate
// then swaps it in and reloads, no manual hard-refresh needed.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update(), 60_000);
  },
});
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/geist-sans/latin.css";
import "@fontsource/overpass-mono/latin-400.css";
import "@fontsource/overpass-mono/latin-600.css";
import "@fontsource/overpass-mono/latin-700.css";
import { ThemeProvider } from "./lib/theme";
import { queryClient } from "./data/hooks";
import { router } from "./router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
