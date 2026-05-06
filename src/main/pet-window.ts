import { join } from 'node:path';
import type { AgentStatus } from '@shared/agent-lifecycle';
import { IPC } from '@shared/ipc';
import type { PetSettings } from '@shared/types';
import { app, BrowserWindow, ipcMain, screen } from 'electron';

let petWindow: BrowserWindow | null = null;

// Default sprite dimensions (cellWidth × cellHeight at scale 1)
const BASE_WIDTH = 192;
const BASE_HEIGHT = 208;

function getSpriteSize(scale: number) {
  return {
    width: Math.round(BASE_WIDTH * scale),
    height: Math.round(BASE_HEIGHT * scale),
  };
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
      preload: join(__dirname, '../preload/pet.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  petWindow.setAlwaysOnTop(true, 'floating');

  if (process.platform === 'darwin') {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Prevent mouse events on the window from activating the app
    petWindow.setIgnoreMouseEvents(false);

    // IMPORTANT: Creating a transparent, non-focusable overlay window can cause
    // macOS to demote the app's activation policy (hiding the Dock icon).
    // Force it back to "regular" so the Dock icon stays visible.
    app.setActivationPolicy('regular');
  }

  // Load the pet renderer page
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void petWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pet.html`);
  } else {
    void petWindow.loadFile(join(__dirname, '../renderer/pet.html'));
  }

  petWindow.on('closed', () => {
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

/** Register IPC handlers for the pet overlay window. */
export function registerPetIpcHandlers(): void {
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

  // Move the pet window to a new screen position (called during drag)
  ipcMain.on(IPC.PET_MOVE_WINDOW, (_event, x: number, y: number) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setPosition(Math.round(x), Math.round(y), false);
  });

  // Pet overlay click → focus the main ForgePad window and tell it to
  // jump to the most urgent agent tab (via AGENT_FOCUS_TAB broadcast).
  ipcMain.on(IPC.PET_FOCUS_AGENT, () => {
    for (const win of BrowserWindow.getAllWindows()) {
      // Skip the pet window itself
      if (win === petWindow) continue;
      if (win.isDestroyed()) continue;
      win.show();
      win.focus();
      // Tell the renderer to jump to the most urgent agent tab.
      // We send a special ptyId '__pet_click__' which the renderer
      // interprets as "find the best agent tab yourself".
      win.webContents.send(IPC.AGENT_FOCUS_TAB, '__pet_click__');
      break; // Only focus the first main window
    }
  });
}

/** Get the pet window instance. */
export function getPetWindow(): BrowserWindow | null {
  return petWindow && !petWindow.isDestroyed() ? petWindow : null;
}

/** Forward agent lifecycle status to the pet overlay so it can animate accordingly. */
export function sendPetAgentStatus(status: AgentStatus): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.PET_AGENT_STATUS_UPDATE, status);
}

/** Forward a PermissionRequest with tool details to the pet overlay. */
export function sendPetPermissionRequest(ptyId: string, toolName: string, toolInput?: Record<string, unknown>): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.PET_PERMISSION_REQUEST, { ptyId, toolName, toolInput });
}

/** Destroy the pet window. */
export function destroyPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.close();
    petWindow = null;
  }
}
