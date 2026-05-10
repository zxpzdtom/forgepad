import path from 'node:path';
import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CustomPetMeta, DeletePetResult, ImportPetResult } from '@shared/types';

function customPetsDir(): string {
  return path.join(app.getPath('userData'), 'custom-pets');
}

/** Validate pet.json schema */
function validatePetJson(data: unknown): data is { id: string; displayName: string; description: string; kind?: string } {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.trim() === '') return false;
  if (typeof obj.displayName !== 'string' || obj.displayName.trim() === '') return false;
  if (typeof obj.description !== 'string') return false;
  if (obj.kind !== undefined && !['person', 'animal', 'object'].includes(obj.kind as string)) return false;
  // ID must only contain safe characters
  if (!/^[a-zA-Z0-9_-]+$/.test(obj.id)) return false;
  return true;
}

export function registerPetHandlers(): void {
  // ── pet:import ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_IMPORT, async (event): Promise<ImportPetResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);

    const result = await dialog.showOpenDialog({
      ...(win ? { parentWindow: win } : {}),
      title: 'Import Custom Pet',
      properties: ['openDirectory'],
      buttonLabel: 'Import',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' };
    }

    const sourceDir = result.filePaths[0];

    try {
      const petJsonPath = path.join(sourceDir, 'pet.json');
      const spritesheetPath = path.join(sourceDir, 'spritesheet.webp');

      // Check files exist
      const [petJsonExists, spritesheetExists] = await Promise.all([
        fs
          .access(petJsonPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(spritesheetPath)
          .then(() => true)
          .catch(() => false),
      ]);

      if (!petJsonExists) {
        return { success: false, error: 'missing_pet_json' };
      }
      if (!spritesheetExists) {
        return { success: false, error: 'missing_spritesheet' };
      }

      // Parse and validate pet.json
      const petJsonRaw = await fs.readFile(petJsonPath, 'utf-8');
      let petData: unknown;
      try {
        petData = JSON.parse(petJsonRaw);
      } catch {
        return { success: false, error: 'invalid_pet_json' };
      }

      if (!validatePetJson(petData)) {
        return { success: false, error: 'invalid_pet_schema' };
      }

      // Basic spritesheet validation (must be > 10KB)
      const stat = await fs.stat(spritesheetPath);
      if (stat.size < 10_000) {
        return { success: false, error: 'invalid_spritesheet' };
      }

      // Prefix ID with 'custom-' to avoid collision with built-in pets
      const customId = `custom-${petData.id}`;

      // Copy files to userData (overwrite if exists)
      const targetDir = path.join(customPetsDir(), customId);
      await fs.mkdir(targetDir, { recursive: true });

      await Promise.all([
        fs.copyFile(spritesheetPath, path.join(targetDir, 'spritesheet.webp')),
        fs.copyFile(petJsonPath, path.join(targetDir, 'pet.json')),
      ]);

      const meta: CustomPetMeta = {
        id: customId,
        displayName: petData.displayName,
        description: petData.description,
        kind: (petData.kind as 'person' | 'animal' | 'object') ?? 'animal',
        importedAt: new Date().toISOString(),
      };

      return { success: true, pet: meta };
    } catch (err) {
      console.error('[ForgePad] Failed to import custom pet:', err);
      return { success: false, error: 'import_failed' };
    }
  });

  // ── pet:delete ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_DELETE, async (_, petId: string): Promise<DeletePetResult> => {
    // Must start with 'custom-' and contain no path separators
    if (!petId.startsWith('custom-') || petId.includes('/') || petId.includes('\\') || petId.includes('..')) {
      return { success: false, error: 'invalid_pet_id' };
    }

    const targetDir = path.join(customPetsDir(), petId);
    const resolved = path.resolve(targetDir);
    const root = path.resolve(customPetsDir());

    if (!resolved.startsWith(root)) {
      return { success: false, error: 'invalid_pet_id' };
    }

    try {
      await fs.rm(targetDir, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      console.error('[ForgePad] Failed to delete custom pet:', err);
      return { success: false, error: 'delete_failed' };
    }
  });

  // ── pet:list ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_LIST, async (): Promise<CustomPetMeta[]> => {
    const dir = customPetsDir();

    try {
      await fs.access(dir);
    } catch {
      return []; // Directory doesn't exist yet
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const pets: CustomPetMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const petJsonPath = path.join(dir, entry.name, 'pet.json');
        const raw = await fs.readFile(petJsonPath, 'utf-8');
        const data = JSON.parse(raw);

        if (validatePetJson(data)) {
          pets.push({
            id: entry.name,
            displayName: data.displayName,
            description: data.description,
            kind: (data.kind as 'person' | 'animal' | 'object') ?? 'animal',
            importedAt: '',
          });
        }
      } catch {
        // Skip malformed entries
        continue;
      }
    }

    return pets;
  });
}
