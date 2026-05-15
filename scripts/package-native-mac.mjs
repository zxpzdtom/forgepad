import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const appName = "ForgePad";
const bundleRoot = join(root, "dist", "native-mac");
const appRoot = join(bundleRoot, `${appName}.app`);
const contents = join(appRoot, "Contents");
const macOS = join(contents, "MacOS");
const resources = join(contents, "Resources");

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
}

function copyFileOrDir(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

rmSync(bundleRoot, { recursive: true, force: true });
mkdirSync(macOS, { recursive: true });
mkdirSync(resources, { recursive: true });

run("pnpm", ["vite:build"]);
run("pnpm", ["backend:build"]);
run("cargo", [
  "build",
  "--release",
  "--manifest-path",
  "crates/forgepad-core/Cargo.toml",
  "--bin",
  "forgepad-core-daemon",
]);
run("swift", ["build", "-c", "release"], {
  cwd: join(root, "native", "macos", "ForgePadHost"),
});

const hostBinary = join(
  root,
  "native",
  "macos",
  "ForgePadHost",
  ".build",
  "release",
  "ForgePadHost",
);
const coreBinary = join(
  root,
  "crates",
  "forgepad-core",
  "target",
  "release",
  "forgepad-core-daemon",
);

copyFileOrDir(hostBinary, join(macOS, "ForgePadHost"));
copyFileOrDir(coreBinary, join(resources, "forgepad-core-daemon"));
copyFileOrDir(process.execPath, join(resources, "node"));
copyFileOrDir(join(root, "dist", "renderer"), join(resources, "renderer"));
copyFileOrDir(join(root, "out", "backend", "index.js"), join(resources, "backend", "index.js"));
chmodSync(join(macOS, "ForgePadHost"), 0o755);
chmodSync(join(resources, "forgepad-core-daemon"), 0o755);
chmodSync(join(resources, "node"), 0o755);

const iconPath = join(root, "build", "icon.icns");
if (existsSync(iconPath)) {
  copyFileOrDir(iconPath, join(resources, "AppIcon.icns"));
}

writeFileSync(
  join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>ForgePadHost</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.forgepad.app.native</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>ForgePad</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`,
);
writeFileSync(join(contents, "PkgInfo"), "APPL????");

run("xattr", ["-cr", appRoot]);

console.log(`\nCreated ${appRoot}`);
