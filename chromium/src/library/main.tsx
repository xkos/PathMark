import { LocalizedApp } from "../ui/LocalizedApp";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/theme.css";
import "./library.css";
import { App } from "./App";
import { initializeDocument } from "../i18n";

initializeDocument("libraryTitle");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocalizedApp component={App} title="libraryTitle" />
  </StrictMode>,
);
