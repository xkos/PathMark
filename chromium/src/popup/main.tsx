import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/theme.css";
import "./popup.css";
import { App } from "./App";
import { initializeDocument } from "../i18n";

initializeDocument("appName");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
