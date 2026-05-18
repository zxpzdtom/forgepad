export type DroppedFileEntry = {
  path: string;
  file?: File;
  objectUrl?: string;
  mimeType?: string;
};

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

export function setForgepadPathDragData(dataTransfer: DataTransfer, path: string): void {
  dataTransfer.setData('text/plain', path);
  dataTransfer.setData('application/x-forgepad-path', path);
  dataTransfer.effectAllowed = 'copy';
}

/**
 * Returns true if the drag event contains any droppable file paths —
 * either an internal forgepad path token or one or more external OS files.
 */
export function hasDraggableFiles(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes('application/x-forgepad-path') || e.dataTransfer.types.includes('Files');
}

/**
 * Extracts all file paths from a drop event.
 *
 * Priority order:
 *  1. Internal forgepad path  (`application/x-forgepad-path`)
 *  2. External OS files       (`dataTransfer.files` via `webUtils.getPathForFile`)
 *  3. Plain text fallback     (`text/plain`)
 *
 * Returns an empty array when nothing useful is found.
 */
export function getDroppedPaths(e: React.DragEvent): string[] {
  const internal = e.dataTransfer.getData('application/x-forgepad-path');
  if (internal) return [internal];

  if (e.dataTransfer.files.length > 0) {
    const paths: string[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      const p = window.forgepad.nativeFiles.getPath(file);
      if (p) paths.push(p);
    }
    if (paths.length > 0) return paths;
  }

  const text = e.dataTransfer.getData('text/plain');
  if (text) return [text];

  return [];
}

export function getDroppedFileEntries(e: React.DragEvent): DroppedFileEntry[] {
  // 1. Internal drag from the file tree
  const internal = e.dataTransfer.getData('application/x-forgepad-path');
  if (internal) return [{ path: internal }];

  // 2. External files dragged from Finder / Explorer
  if (e.dataTransfer.files.length > 0) {
    const entries: DroppedFileEntry[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      const p = window.forgepad.nativeFiles.getPath(file);
      if (!p) continue;
      entries.push(
        isAbsolutePath(p)
          ? { path: p, file, mimeType: file.type }
          : { path: file.name || p, file, objectUrl: URL.createObjectURL(file), mimeType: file.type },
      );
    }
    if (entries.length > 0) return entries;
  }

  // 3. Plain text fallback (e.g. terminal drag)
  const text = e.dataTransfer.getData('text/plain');
  if (text) return [{ path: text }];

  return [];
}

/**
 * Returns true when the drop event originates from the internal file tree
 * (i.e. carries our custom MIME type).
 */
export function isInternalDrop(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes('application/x-forgepad-path');
}
