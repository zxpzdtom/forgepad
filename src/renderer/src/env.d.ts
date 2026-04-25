import type { ForgePadApi } from "../../preload";

declare global {
  interface Window {
    forgepad: ForgePadApi;
  }
}

export {};

