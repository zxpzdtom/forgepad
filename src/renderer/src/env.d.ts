import type { ForgePadApi } from '../../preload';

declare global {
  interface Window {
    forgepad: ForgePadApi;
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
