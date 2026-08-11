import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/theme.css";
import "./library.css";
import { App } from "./App";
import { initializeDocument } from "../i18n";

initializeDocument("libraryTitle");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
