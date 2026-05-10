import type { ForgePadApi } from './tauri-api';
import type { ForgePadPetApi } from '../../preload/pet';

declare global {
  interface Window {
    forgepad: ForgePadApi;
    forgepadPet?: ForgePadPetApi;
    __TAURI_INTERNALS__?: unknown;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          preload?: string;
          partition?: string;
          allowpopups?: string;
          nodeintegration?: string;
          webpreferences?: string;
          httpreferrer?: string;
          useragent?: string;
          disablewebsecurity?: string;
        },
        HTMLElement
      >;
    }
  }
}
