import { useMemo } from "react";
import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
  getBuiltInFileIconColor,
} from "@pierre/trees";

// ── Singleton icon resolver (complete set, matching the FilesPanel config) ──
const { resolveIcon } = createFileTreeIconResolver({
  set: "complete",
  colored: true,
});

// ── Inject the SVG sprite sheet into the light DOM once ──
let spriteInjected = false;
function ensureSpriteSheet() {
  if (spriteInjected) return;
  spriteInjected = true;
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.width = "0";
  wrapper.style.height = "0";
  wrapper.style.overflow = "hidden";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.innerHTML = getBuiltInSpriteSheet("complete");
  document.body.prepend(wrapper);
}

ensureSpriteSheet();

// ── Component ──

export function FileIcon({
  filePath,
  size = 16,
}: {
  filePath: string;
  size?: number;
}) {
  const resolved = useMemo(
    () => resolveIcon("file-tree-icon-file", filePath),
    [filePath],
  );

  const color = resolved.token
    ? getBuiltInFileIconColor(resolved.token)
    : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox={resolved.viewBox ?? "0 0 16 16"}
      aria-hidden="true"
      style={color ? { color } : undefined}
    >
      <use href={`#${resolved.name}`} />
    </svg>
  );
}
