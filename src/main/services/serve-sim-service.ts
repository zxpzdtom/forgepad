import type { ChildProcess } from 'node:child_process';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { SimulatorDevice } from '@shared/types';
import { net } from 'electron';

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────

type SimctlDevice = {
  udid: string;
  name: string;
  state: string;
  deviceTypeIdentifier: string;
  isAvailable: boolean;
};

type ActiveStream = {
  port: number;
  process: ChildProcess;
  udid: string;
};

/** Device category for sorting: iPhone first, iPad second, everything else last. */
function deviceCategory(name: string): number {
  if (name.startsWith('iPhone')) return 0;
  if (name.startsWith('iPad')) return 1;
  return 2; // Apple Watch, Apple TV, Apple Vision Pro, etc.
}

// ── Service ───────────────────────────────────────────────────────────────

class ServeSimServiceImpl {
  /** Map<udid, ActiveStream> — tracks one serve-sim-bin process per device */
  private streams = new Map<string, ActiveStream>();

  /** Next port to assign. Start at 3100 (serve-sim's default). */
  private nextPort = 3100;

  /** Cached DYLD env (computed once). */
  private cachedEnv: NodeJS.ProcessEnv | null = null;

  // ── Binary Resolution ─────────────────────────────────────────────────

  /**
   * Resolve the serve-sim-bin binary from node_modules.
   * Tries multiple resolution strategies for dev vs. packaged.
   */
  private async resolveBinary(): Promise<string> {
    const candidates = [
      // Dev mode: relative to compiled main process output
      join(__dirname, '..', '..', 'node_modules', 'serve-sim', 'bin', 'serve-sim-bin'),
      // Production: asar unpacked
      join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', 'serve-sim', 'bin', 'serve-sim-bin'),
      // Fallback: cwd
      join(process.cwd(), 'node_modules', 'serve-sim', 'bin', 'serve-sim-bin'),
    ];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // try next
      }
    }

    throw new Error('serve-sim-bin not found. Make sure serve-sim is installed: npm install serve-sim');
  }

  // ── Spawn Environment ──────────────────────────────────────────────────

  /**
   * Build the environment for spawning serve-sim-bin.
   * Injects DYLD_FRAMEWORK_PATH so the binary can find
   * SimulatorKit/CoreSimulator from the user's Xcode installation.
   */
  private helperSpawnEnv(): NodeJS.ProcessEnv {
    if (this.cachedEnv) return this.cachedEnv;

    let dev: string | null = null;
    try {
      dev = execFileSync('xcode-select', ['-p'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // xcode-select not available
    }

    if (!dev) {
      this.cachedEnv = process.env;
      return process.env;
    }

    const fw = `${dev}/Library/PrivateFrameworks`;
    this.cachedEnv = {
      ...process.env,
      DYLD_FRAMEWORK_PATH: process.env.DYLD_FRAMEWORK_PATH ? `${fw}:${process.env.DYLD_FRAMEWORK_PATH}` : fw,
    };
    return this.cachedEnv;
  }

  // ── Xcode Check ────────────────────────────────────────────────────────

  async checkXcode(): Promise<{ available: boolean; message?: string }> {
    try {
      await execFileAsync('xcode-select', ['-p']);
    } catch {
      return {
        available: false,
        message: 'Xcode is not installed. Install Xcode from the Mac App Store.',
      };
    }

    // Verify simctl is available
    try {
      await execFileAsync('xcrun', ['simctl', 'help'], { timeout: 5000 });
    } catch {
      return {
        available: false,
        message: 'xcrun simctl not available. Install Xcode command line tools.',
      };
    }

    return { available: true };
  }

  // ── Device Management (via simctl) ──────────────────────────────────────

  /**
   * List all simulator devices using `xcrun simctl list devices -j`.
   * Sorted: booted first, then iPhone → iPad → others, then alphabetical.
   */
  async listDevices(): Promise<SimulatorDevice[]> {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 10_000 });

    const json = JSON.parse(stdout) as {
      devices: Record<string, SimctlDevice[]>;
    };

    const result: SimulatorDevice[] = [];

    for (const [runtimeId, deviceList] of Object.entries(json.devices)) {
      // Parse runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-0" → "iOS 18.0"
      const runtimeLabel = runtimeId
        .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, '')
        .replace(/-(\d)/g, ' $1') // First digit separator: "iOS-18" → "iOS 18"
        .replace(/-/g, '.'); // Remaining dashes → dots: "18-0" → "18.0"

      for (const dev of deviceList) {
        if (!dev.isAvailable) continue;
        result.push({
          id: dev.udid,
          name: dev.name,
          state: dev.state,
          isBooted: dev.state === 'Booted',
          runtime: runtimeLabel,
        });
      }
    }

    // Sort: booted first → iPhone → iPad → others → alphabetical
    result.sort((a, b) => {
      if (a.isBooted !== b.isBooted) return a.isBooted ? -1 : 1;
      const catA = deviceCategory(a.name);
      const catB = deviceCategory(b.name);
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /** Boot a simulator device via simctl. */
  async bootDevice(udid: string): Promise<void> {
    await execFileAsync('xcrun', ['simctl', 'boot', udid], { timeout: 30_000 });
  }

  /** Shutdown a simulator device via simctl. */
  async shutdownDevice(udid: string): Promise<void> {
    // Stop any active stream first
    this.stopStream(udid);
    await execFileAsync('xcrun', ['simctl', 'shutdown', udid], { timeout: 15_000 });
  }

  // ── Stream Management (serve-sim-bin per device) ─────────────────────

  /**
   * Start a serve-sim-bin process for a specific device.
   * Auto-boots the device if it's not already booted.
   * Returns the port the server is listening on.
   */
  async startStream(udid: string): Promise<{ port: number }> {
    // If already streaming this device, return existing port
    const existing = this.streams.get(udid);
    if (existing) {
      // Verify it's still healthy
      if (await this.isHealthy(existing.port)) {
        return { port: existing.port };
      }
      // Dead process, clean up
      this.cleanupStream(udid);
    }

    // Auto-boot: check if device is booted, boot if needed
    if (!(await this.isDeviceBooted(udid))) {
      await this.bootDevice(udid);
      // Wait a moment for the simulator to finish booting
      await new Promise((r) => setTimeout(r, 1500));
    }

    const binaryPath = await this.resolveBinary();
    const port = this.nextPort++;

    const proc = spawn(binaryPath, [udid, '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: this.helperSpawnEnv(),
    });

    const stream: ActiveStream = { port, process: proc, udid };
    this.streams.set(udid, stream);

    // Handle process exit
    proc.on('exit', (_code) => {
      const current = this.streams.get(udid);
      if (current?.process === proc) {
        this.streams.delete(udid);
      }
    });

    proc.on('error', (err) => {
      console.error(`[serve-sim] Process error for ${udid}:`, err.message);
      this.streams.delete(udid);
    });

    // Collect stderr for diagnostics
    let stderrBuf = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-2048);
    });

    // Wait for the server to become healthy (up to 10s)
    const healthy = await this.waitForHealth(port, 10_000);
    if (!healthy) {
      proc.kill();
      this.streams.delete(udid);
      throw new Error(`serve-sim failed to start for ${udid} within 10s. stderr: ${stderrBuf.slice(0, 500)}`);
    }

    return { port };
  }

  /** Stop the serve-sim-bin process for a specific device. */
  stopStream(udid: string): void {
    this.cleanupStream(udid);
  }

  /** Stop ALL active streams (called on app quit). */
  stopAll(): void {
    for (const udid of [...this.streams.keys()]) {
      this.cleanupStream(udid);
    }
  }

  /** Get status of all active streams. */
  getActiveStreams(): Array<{ udid: string; port: number }> {
    return [...this.streams.entries()].map(([udid, s]) => ({
      udid,
      port: s.port,
    }));
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** Check if a device is currently booted via simctl. */
  private async isDeviceBooted(udid: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 10_000 });
      const json = JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> };
      for (const deviceList of Object.values(json.devices)) {
        for (const dev of deviceList) {
          if (dev.udid === udid) return dev.state === 'Booted';
        }
      }
    } catch {
      // If we can't check, assume not booted
    }
    return false;
  }

  private cleanupStream(udid: string): void {
    const stream = this.streams.get(udid);
    if (!stream) return;
    try {
      stream.process.kill('SIGTERM');
    } catch {
      // already dead
    }
    this.streams.delete(udid);
  }

  private async isHealthy(port: number): Promise<boolean> {
    try {
      const res = await net.fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isHealthy(port)) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
}

/** Singleton instance. */
export const serveSimService = new ServeSimServiceImpl();
