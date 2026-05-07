import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build as esbuild } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const fromRoot = (path: string) => resolve(root, path);

/**
 * Custom plugin that builds extension-popup.ts as a self-contained CJS file.
 *
 * The extension popup window loads `chrome-extension://` URLs which force
 * sandbox mode in Electron, preventing ESM preloads. So we bundle it
 * separately as CJS with all dependencies inlined.
 */
function buildExtensionPopupPreload() {
  return {
    name: "build-extension-popup-preload",
    closeBundle: async () => {
      await esbuild({
        entryPoints: [fromRoot("src/preload/extension-popup.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: fromRoot("out/preload/extension-popup.cjs"),
        external: ["electron"],
        tsconfig: fromRoot("tsconfig.node.json"),
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": fromRoot("src/main"),
        "@shared": fromRoot("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), buildExtensionPopupPreload()],
    build: {
      rollupOptions: {
        input: {
          index: fromRoot("src/preload/index.ts"),
          pet: fromRoot("src/preload/pet.ts"),
          browser: fromRoot("src/preload/browser.ts"),
        },
      },
    },
    resolve: {
      alias: {
        "@shared": fromRoot("src/shared"),
      },
    },
  },
  renderer: {
    root: fromRoot("src/renderer"),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: fromRoot("src/renderer/index.html"),
          pet: fromRoot("src/renderer/pet.html"),
          browser: fromRoot("src/renderer/browser.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": fromRoot("src/renderer/src"),
        "@shared": fromRoot("src/shared"),
      },
    },
  },
});
