import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const fromRoot = (path: string) => resolve(root, path);

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
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": fromRoot("src/shared"),
      },
    },
  },
  renderer: {
    root: fromRoot("src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": fromRoot("src/renderer/src"),
        "@shared": fromRoot("src/shared"),
      },
    },
  },
});
