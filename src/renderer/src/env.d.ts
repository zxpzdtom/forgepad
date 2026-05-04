import type { ForgePadApi } from '../../preload';
import type { ForgePadPetApi } from '../../preload/pet';

declare global {
  interface Window {
    forgepad: ForgePadApi;
    forgepadPet?: ForgePadPetApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<Electron.WebviewTag> & {
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
        Electron.WebviewTag
      >;
    }
  }
}
