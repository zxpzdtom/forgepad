import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appName = pkg.productName || "ForgePad";
const bundleIdentifier = pkg.bundleIdentifier || "com.forgepad.app";
const appVersion = pkg.version || "0.1.0";
const bundleRoot = join(root, "dist", "native-mac");
const appRoot = join(bundleRoot, `${appName}.app`);
const contents = join(appRoot, "Contents");
const macOS = join(contents, "MacOS");
const resources = join(contents, "Resources");
const hostAppBinary = join(macOS, "ForgePadHost");
const bundledCoreBinary = join(resources, "forgepad-core-daemon");
const codesignIdentity = process.env.FORGEPAD_CODESIGN_IDENTITY?.trim() || "-";
const skipCodesign = process.env.FORGEPAD_SKIP_CODESIGN === "1";
const isAdHocSigning = codesignIdentity === "-";
const isDeveloperIdSigning = codesignIdentity.startsWith("Developer ID Application:");
const entitlementsPath =
  process.env.FORGEPAD_CODESIGN_ENTITLEMENTS || join(root, "build", "macos", "ForgePad.entitlements");
const shouldNotarize = process.env.FORGEPAD_NOTARIZE === "1";
const notaryProfile = process.env.FORGEPAD_NOTARY_KEYCHAIN_PROFILE?.trim();
const notaryAppleId = process.env.FORGEPAD_NOTARY_APPLE_ID?.trim();
const notaryTeamId = process.env.FORGEPAD_NOTARY_TEAM_ID?.trim();
const notaryPassword = process.env.FORGEPAD_NOTARY_PASSWORD?.trim();
const appZip = join(bundleRoot, `${appName}.zip`);

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

function codesign(target, { entitlements = false } = {}) {
  if (skipCodesign) return;

  const args = ["--force", "--sign", codesignIdentity, "--options", "runtime"];
  if (isDeveloperIdSigning) {
    args.push("--timestamp");
  }
  if (entitlements && existsSync(entitlementsPath)) {
    args.push("--entitlements", entitlementsPath);
  }
  args.push(target);
  run("codesign", args);
}

function verifyCodesign(target) {
  if (skipCodesign) return;
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=4", target]);
}

function notarizeApp() {
  if (!shouldNotarize) return;
  if (skipCodesign) {
    throw new Error("Cannot notarize when FORGEPAD_SKIP_CODESIGN=1.");
  }
  if (isAdHocSigning) {
    throw new Error("Cannot notarize an ad-hoc signed app. Set FORGEPAD_CODESIGN_IDENTITY to a Developer ID Application certificate.");
  }

  const submitArgs = ["notarytool", "submit", appZip, "--wait"];
  if (notaryProfile) {
    submitArgs.push("--keychain-profile", notaryProfile);
  } else if (notaryAppleId && notaryTeamId && notaryPassword) {
    submitArgs.push("--apple-id", notaryAppleId, "--team-id", notaryTeamId, "--password", notaryPassword);
  } else {
    throw new Error(
      "Set FORGEPAD_NOTARY_KEYCHAIN_PROFILE, or set FORGEPAD_NOTARY_APPLE_ID, FORGEPAD_NOTARY_TEAM_ID, and FORGEPAD_NOTARY_PASSWORD.",
    );
  }

  run("ditto", ["-c", "-k", "--keepParent", appRoot, appZip]);
  run("xcrun", submitArgs);
  run("xcrun", ["stapler", "staple", appRoot]);
  run("spctl", ["-a", "-vvv", "-t", "execute", appRoot]);
}

rmSync(bundleRoot, { recursive: true, force: true });
mkdirSync(macOS, { recursive: true });
mkdirSync(resources, { recursive: true });

run("pnpm", ["exec", "vite", "build"]);
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

copyFileOrDir(hostBinary, hostAppBinary);
copyFileOrDir(coreBinary, bundledCoreBinary);
copyFileOrDir(join(root, "dist", "renderer"), join(resources, "renderer"));
chmodSync(hostAppBinary, 0o755);
chmodSync(bundledCoreBinary, 0o755);

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
  <string>${bundleIdentifier}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>ForgePad</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${appVersion}</string>
  <key>CFBundleVersion</key>
  <string>${appVersion}</string>
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

if (skipCodesign) {
  console.warn("\nSkipping codesign because FORGEPAD_SKIP_CODESIGN=1.");
} else {
  if (isAdHocSigning) {
    console.warn(
      "\nSigning with an ad-hoc identity. For distribution, set FORGEPAD_CODESIGN_IDENTITY to a Developer ID Application certificate and notarize the app.",
    );
  } else if (!isDeveloperIdSigning) {
    console.warn(
      `\nSigning with "${codesignIdentity}". This is useful for local testing, but distribution builds should use a Developer ID Application certificate and notarization.`,
    );
  } else if (!existsSync(entitlementsPath)) {
    console.warn(`\nNo entitlements file found at ${entitlementsPath}; signing without explicit entitlements.`);
  }

  codesign(bundledCoreBinary);
  codesign(hostAppBinary, { entitlements: true });
  codesign(appRoot, { entitlements: true });
  verifyCodesign(appRoot);
  notarizeApp();
}

console.log(`\nCreated ${appRoot} (Rust backend)`);
