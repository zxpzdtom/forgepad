import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build as esbuild } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const fromRoot = (path: string) => resolve(root, path);

/**
 * Custom plugin that builds extension-api.ts as a standalone browser bundle.
 *
 * This preload is registered at the session level via
 * session.registerPreloadScript() so it runs in ALL frames including
 * chrome-extension:// popup pages. Uses browser platform since the session
 * preload runs in a renderer-like context.
 */
function buildExtensionApiPreload() {
  return {
    name: "build-extension-api-preload",
    closeBundle: async () => {
      await esbuild({
        entryPoints: [fromRoot("src/preload/extension-api.ts")],
        bundle: true,
        platform: "browser",
        format: "cjs",
        outfile: fromRoot("out/preload/extension-api.cjs"),
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
    plugins: [externalizeDepsPlugin(), buildExtensionApiPreload()],
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
