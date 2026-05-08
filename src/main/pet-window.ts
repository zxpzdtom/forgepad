import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { IPC } from "@shared/ipc";
import type { AgentStatusUpdate } from "@shared/agent-lifecycle";
import type {
  AskUserQuestionItem,
  PetCommand,
  PetSettings,
  PetStageRect,
  PetStageSnapshot,
  PetStageWindow,
  PermissionSuggestion,
} from "@shared/types";

let petWindow: BrowserWindow | null = null;
const execFileAsync = promisify(execFile);

// Default sprite dimensions (cellWidth × cellHeight at scale 1)
const BASE_WIDTH = 192;
const BASE_HEIGHT = 208;
const MIN_STAGE_WINDOW_WIDTH = 220;
const MIN_STAGE_WINDOW_HEIGHT = 120;
const STAGE_CACHE_MS = 2_500;
let stageCache: PetStageSnapshot | null = null;
let stageCacheAt = 0;
let systemWindowProbeDisabledUntil = 0;

function getSpriteSize(scale: number) {
  return {
    width: Math.round(BASE_WIDTH * scale),
    height: Math.round(BASE_HEIGHT * scale),
  };
}

function rectFromWorkArea(rect: Electron.Rectangle): PetStageRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function makeWindowId(
  win: Pick<
    PetStageWindow,
    "appName" | "title" | "x" | "y" | "width" | "height" | "source"
  >,
): string {
  return [
    win.source,
    win.appName,
    win.title,
    win.x,
    win.y,
    win.width,
    win.height,
  ].join(":");
}

function isUsableStageWindow(win: PetStageWindow): boolean {
  if (
    win.width < MIN_STAGE_WINDOW_WIDTH ||
    win.height < MIN_STAGE_WINDOW_HEIGHT
  )
    return false;
  if (petWindow && !petWindow.isDestroyed()) {
    const [petX, petY] = petWindow.getPosition();
    const [petW, petH] = petWindow.getSize();
    const sameRect =
      Math.abs(win.x - petX) <= 4 &&
      Math.abs(win.y - petY) <= 4 &&
      Math.abs(win.width - petW) <= 4 &&
      Math.abs(win.height - petH) <= 4;
    if (sameRect) return false;
  }
  return true;
}

function getElectronStageWindows(): PetStageWindow[] {
  return BrowserWindow.getAllWindows()
    .filter(
      (win) =>
        win !== petWindow &&
        !win.isDestroyed() &&
        win.isVisible() &&
        !win.isMinimized(),
    )
    .map((win): PetStageWindow => {
      const bounds = win.getBounds();
      const title = win.getTitle();
      const stageWindow = {
        id: "",
        appName: app.getName() || "ForgePad",
        title: title || "ForgePad",
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        source: "electron" as const,
      };
      return { ...stageWindow, id: makeWindowId(stageWindow) };
    })
    .filter(isUsableStageWindow);
}

const MAC_VISIBLE_WINDOWS_SCRIPT = `
set rows to {}
tell application "System Events"
  repeat with proc in (application processes whose visible is true)
    set appName to name of proc as text
    try
      repeat with win in windows of proc
        try
          set winName to name of win as text
          set winPos to position of win
          set winSize to size of win
          set end of rows to appName & tab & winName & tab & (item 1 of winPos as text) & tab & (item 2 of winPos as text) & tab & (item 1 of winSize as text) & tab & (item 2 of winSize as text)
        end try
      end repeat
    end try
  end repeat
end tell
set AppleScript's text item delimiters to linefeed
return rows as text
`;

async function getSystemStageWindows(): Promise<PetStageWindow[]> {
  if (process.platform !== "darwin") return [];
  if (Date.now() < systemWindowProbeDisabledUntil) return [];
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-e", MAC_VISIBLE_WINDOWS_SCRIPT],
      {
        timeout: 1_200,
        maxBuffer: 512 * 1024,
      },
    );

    return String(stdout)
      .split(/\r?\n/)
      .map((line): PetStageWindow | null => {
        const [appName, title, xRaw, yRaw, widthRaw, heightRaw] =
          line.split("\t");
        const x = Number(xRaw);
        const y = Number(yRaw);
        const width = Number(widthRaw);
        const height = Number(heightRaw);
        if (
          !appName ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height)
        ) {
          return null;
        }
        const stageWindow = {
          id: "",
          appName,
          title: title || appName,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          source: "system" as const,
        };
        return { ...stageWindow, id: makeWindowId(stageWindow) };
      })
      .filter((win): win is PetStageWindow => Boolean(win))
      .filter(isUsableStageWindow);
  } catch {
    systemWindowProbeDisabledUntil = Date.now() + 30_000;
    return [];
  }
}

function dedupeStageWindows(windows: PetStageWindow[]): PetStageWindow[] {
  const seen = new Set<string>();
  const deduped: PetStageWindow[] = [];
  for (const win of windows) {
    const rectKey = `${win.x}:${win.y}:${win.width}:${win.height}`;
    if (seen.has(rectKey)) continue;
    seen.add(rectKey);
    deduped.push(win);
  }
  return deduped;
}

export async function getPetStageSnapshot(): Promise<PetStageSnapshot> {
  const now = Date.now();
  if (stageCache && now - stageCacheAt < STAGE_CACHE_MS) return stageCache;

  const primary = screen.getPrimaryDisplay();
  const snapshot: PetStageSnapshot = {
    capturedAt: now,
    workArea: rectFromWorkArea(primary.workArea),
    displays: screen
      .getAllDisplays()
      .map((display) => rectFromWorkArea(display.workArea)),
    windows: dedupeStageWindows([
      ...getElectronStageWindows(),
      ...(await getSystemStageWindows()),
    ]),
  };

  stageCache = snapshot;
  stageCacheAt = now;
  return snapshot;
}

/**
 * Creates a small, sprite-sized transparent window for the desktop pet.
 * The window is exactly the size of one animation frame — no fullscreen overlay.
 * This avoids blocking any interaction with other windows.
 */
export function createPetWindow(scale = 0.8): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;

  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const { x: areaX, y: areaY } = display.workArea;
  const { width, height } = getSpriteSize(scale);

  // Start at bottom-right of the work area
  const startX = areaX + screenW - width - 40;
  const startY = areaY + screenH - height - 40;

  petWindow = new BrowserWindow({
    width,
    height,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "../preload/pet.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  petWindow.setAlwaysOnTop(true, "floating");

  if (process.platform === "darwin") {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Prevent mouse events on the window from activating the app
    petWindow.setIgnoreMouseEvents(false);

    // IMPORTANT: Creating a transparent, non-focusable overlay window can cause
    // macOS to demote the app's activation policy (hiding the Dock icon).
    // Force it back to "regular" so the Dock icon stays visible.
    app.setActivationPolicy("regular");
  }

  // Load the pet renderer page
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void petWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pet.html`);
  } else {
    void petWindow.loadFile(join(__dirname, "../renderer/pet.html"));
  }

  petWindow.on("closed", () => {
    petWindow = null;
  });

  return petWindow;
}

/** Send updated pet settings to the overlay window. */
export function sendPetSettings(settings: PetSettings): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.PET_SETTINGS_CHANGED, settings);

  // Resize the window to match the new scale
  const { width, height } = getSpriteSize(settings.petSize);
  petWindow.setSize(width, height);
}

/** Show or hide the pet overlay. */
export function setPetWindowVisible(visible: boolean): void {
  if (!petWindow || petWindow.isDestroyed()) {
    if (visible) createPetWindow();
    return;
  }
  if (visible) {
    petWindow.showInactive();
  } else {
    petWindow.hide();
  }
}

function focusFirstMainWindow(silent = false): BrowserWindow | null {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === petWindow || win.isDestroyed()) continue;
    if (silent) {
      // Give the window keyboard focus without raising it to the front.
      // On macOS this keeps it behind whatever the user is working in.
      win.focusOnWebView();
    } else {
      win.show();
      win.focus();
    }
    return win;
  }
  return null;
}

/** Register IPC handlers for the pet overlay window. */
export function registerPetIpcHandlers(): void {
  ipcMain.handle(IPC.PET_GET_STAGE, async () => getPetStageSnapshot());

  ipcMain.on(IPC.PET_COMMAND, (_event, command: PetCommand) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.webContents.send(IPC.PET_COMMAND, command);
  });

  // Resize the pet window (used when approval popup appears/disappears)
  ipcMain.on(IPC.PET_RESIZE_WINDOW, (_event, width: number, height: number) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    // Resize while keeping the bottom-right corner anchored
    const [curX, curY] = petWindow.getPosition();
    const [curW, curH] = petWindow.getSize();
    const newX = curX + (curW - width);
    const newY = curY + (curH - height);
    petWindow.setSize(Math.round(width), Math.round(height), false);
    petWindow.setPosition(Math.round(newX), Math.round(newY), false);
  });

  // Move the pet window to a new screen position (called during drag / wander)
  ipcMain.on(IPC.PET_MOVE_WINDOW, (_event, x: number, y: number) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    // Clamp to the work area of the nearest display so the pet never goes off-screen
    const display = screen.getDisplayNearestPoint({
      x: Math.round(x),
      y: Math.round(y),
    });
    const {
      x: areaX,
      y: areaY,
      width: areaW,
      height: areaH,
    } = display.workArea;
    const [winW, winH] = petWindow.getSize();
    const clampedX = Math.max(
      areaX,
      Math.min(areaX + areaW - winW, Math.round(x)),
    );
    const clampedY = Math.max(
      areaY,
      Math.min(areaY + areaH - winH, Math.round(y)),
    );
    petWindow.setPosition(clampedX, clampedY, false);
  });

  // Pet overlay click → focus the main ForgePad window and tell it to
  // jump to the most urgent agent tab (via AGENT_FOCUS_TAB broadcast).
  ipcMain.on(IPC.PET_FOCUS_AGENT, (_event, ptyId?: string) => {
    const win = focusFirstMainWindow();
    // Tell the renderer to jump to a concrete agent tab when provided.
    // Without a ptyId, use the special signal interpreted as
    // "find the best agent tab yourself".
    win?.webContents.send(IPC.AGENT_FOCUS_TAB, ptyId || "__pet_click__");
  });
}

/** Get the pet window instance. */
export function getPetWindow(): BrowserWindow | null {
  return petWindow && !petWindow.isDestroyed() ? petWindow : null;
}

/** Forward agent lifecycle status to the pet overlay so it can animate accordingly. */
export function sendPetAgentStatus(update: AgentStatusUpdate): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.PET_AGENT_STATUS_UPDATE, update);
}

/** Forward a PermissionRequest with tool details to the pet overlay. */
export function sendPetPermissionRequest(
  ptyId: string,
  toolName: string,
  toolInput?: Record<string, unknown>,
  permissionSuggestions?: PermissionSuggestion[],
  questions?: AskUserQuestionItem[],
): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.PET_PERMISSION_REQUEST, {
    ptyId,
    toolName,
    toolInput,
    permissionSuggestions,
    questions,
  });
}

/** Destroy the pet window. */
export function destroyPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.close();
    petWindow = null;
  }
}
