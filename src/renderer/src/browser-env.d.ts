import type { ForgePadBrowserApi } from "../../preload/browser";

declare global {
  interface Window {
    forgepadBrowser: ForgePadBrowserApi;
  }
}
