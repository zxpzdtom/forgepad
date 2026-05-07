import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "allotment/dist/style.css";
import "./styles/global.css";

import { PopoutBrowser } from "./components/popout/PopoutBrowser";
import { PopoutI18nProvider } from "./components/popout/PopoutI18nProvider";

createRoot(document.getElementById("browser-root")!).render(
  <React.StrictMode>
    <PopoutI18nProvider>
      <PopoutBrowser />
    </PopoutI18nProvider>
  </React.StrictMode>,
);
