import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
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
