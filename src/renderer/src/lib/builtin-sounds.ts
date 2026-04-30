/**
 * Built-in notification sounds synthesized via the Web Audio API.
 * No external audio files are needed — everything is generated in code.
 */

export type BuiltinSoundId =
  | 'ping'
  | 'quick-ping'
  | 'arcade'
  | 'shamisen'
  | 'doo-wap'
  | 'agent-done'
  | 'code-complete'
  | 'long-edm'
  | 'come-back'
  | 'shabalaba';

export type SoundDefinition = {
  id: BuiltinSoundId;
  name: string;
  subtitle: string;
  durationMs: number;
  play: (ctx: AudioContext, volume: number) => void;
};

// ─── Utility helpers ───

function gainNode(ctx: AudioContext, vol: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(ctx.destination);
  return g;
}

function osc(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  startAt: number,
  stopAt: number,
  attackAmp = 0.8,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(attackAmp, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  o.connect(g);
  g.connect(dest);
  o.start(startAt);
  o.stop(stopAt + 0.05);
}

function pluck(ctx: AudioContext, dest: AudioNode, freq: number, startAt: number, decayS = 0.5) {
  // Karplus-Strong-like pluck via filtered noise + oscillator blend
  const bufLen = ctx.sampleRate * decayS;
  const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / bufLen) * 6);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 20;

  const g = ctx.createGain();
  g.gain.value = 0.9;

  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(startAt);
}

// ─── Individual sound definitions ───

const ping: SoundDefinition = {
  id: 'ping',
  name: 'Ping',
  subtitle: 'Classic notification tone',
  durationMs: 600,
  play(ctx, volume) {
    const g = gainNode(ctx, volume);
    osc(ctx, g, 880, 'sine', ctx.currentTime, ctx.currentTime + 0.55);
  },
};

const quickPing: SoundDefinition = {
  id: 'quick-ping',
  name: 'Quick Ping',
  subtitle: 'Short and sweet',
  durationMs: 250,
  play(ctx, volume) {
    const g = gainNode(ctx, volume);
    osc(ctx, g, 1100, 'sine', ctx.currentTime, ctx.currentTime + 0.22);
  },
};

const arcade: SoundDefinition = {
  id: 'arcade',
  name: 'Arcade',
  subtitle: 'Retro game style',
  durationMs: 500,
  play(ctx, volume) {
    const g = gainNode(ctx, volume * 0.6);
    const now = ctx.currentTime;
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((f, i) => {
      osc(ctx, g, f, 'square', now + i * 0.08, now + i * 0.08 + 0.12, 0.5);
    });
  },
};

const shamisen: SoundDefinition = {
  id: 'shamisen',
  name: 'Shamisen',
  subtitle: 'Japanese stringed instrument',
  durationMs: 1200,
  play(ctx, volume) {
    const g = gainNode(ctx, volume);
    const now = ctx.currentTime;
    pluck(ctx, g, 294, now, 0.8);
    pluck(ctx, g, 392, now + 0.25, 0.7);
    pluck(ctx, g, 440, now + 0.5, 0.9);
  },
};

const dooWap: SoundDefinition = {
  id: 'doo-wap',
  name: 'Doo-Wap',
  subtitle: 'Two-tone melody',
  durationMs: 500,
  play(ctx, volume) {
    const g = gainNode(ctx, volume);
    const now = ctx.currentTime;
    osc(ctx, g, 440, 'sine', now, now + 0.22);
    osc(ctx, g, 554, 'sine', now + 0.22, now + 0.45);
  },
};

const agentDone: SoundDefinition = {
  id: 'agent-done',
  name: 'Agent is Done',
  subtitle: 'Ascending completion chime',
  durationMs: 900,
  play(ctx, volume) {
    const g = gainNode(ctx, volume * 0.7);
    const now = ctx.currentTime;
    const scale = [523, 659, 784, 1047]; // C5 E5 G5 C6
    scale.forEach((f, i) => {
      osc(ctx, g, f, 'sine', now + i * 0.14, now + i * 0.14 + 0.25);
    });
  },
};

const codeComplete: SoundDefinition = {
  id: 'code-complete',
  name: 'Code Complete',
  subtitle: 'Soft two-note resolve',
  durationMs: 700,
  play(ctx, volume) {
    const g = gainNode(ctx, volume * 0.7);
    const now = ctx.currentTime;
    osc(ctx, g, 659, 'sine', now, now + 0.3);
    osc(ctx, g, 784, 'sine', now + 0.28, now + 0.65);
  },
};

const longEdm: SoundDefinition = {
  id: 'long-edm',
  name: 'Long EDM',
  subtitle: 'Electronic dance music burst',
  durationMs: 1500,
  play(ctx, volume) {
    const g = gainNode(ctx, volume * 0.5);
    const now = ctx.currentTime;
    const pattern = [261, 329, 392, 523, 392, 329, 523, 659];
    pattern.forEach((f, i) => {
      osc(ctx, g, f, 'sawtooth', now + i * 0.12, now + i * 0.12 + 0.1, 0.4);
    });
    // Kick-like thump
    const kick = ctx.createOscillator();
    const kickG = ctx.createGain();
    kick.frequency.setValueAtTime(150, now);
    kick.frequency.exponentialRampToValueAtTime(0.001, now + 0.3);
    kickG.gain.setValueAtTime(volume * 0.8, now);
    kickG.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    kick.connect(kickG);
    kickG.connect(ctx.destination);
    kick.start(now);
    kick.stop(now + 0.35);
  },
};

const comeBack: SoundDefinition = {
  id: 'come-back',
  name: 'Come Back',
  subtitle: 'Beckoning call',
  durationMs: 800,
  play(ctx, volume) {
    const g = gainNode(ctx, volume);
    const now = ctx.currentTime;
    // Descending then ascending
    osc(ctx, g, 784, 'sine', now, now + 0.18);
    osc(ctx, g, 659, 'sine', now + 0.18, now + 0.36);
    osc(ctx, g, 523, 'sine', now + 0.36, now + 0.54);
    osc(ctx, g, 659, 'sine', now + 0.54, now + 0.75);
  },
};

const shabalaba: SoundDefinition = {
  id: 'shabalaba',
  name: 'Shabalaba',
  subtitle: 'Playful bouncy tones',
  durationMs: 700,
  play(ctx, volume) {
    const g = gainNode(ctx, volume * 0.6);
    const now = ctx.currentTime;
    const freqs = [880, 1174, 880, 1318, 1047, 1568];
    freqs.forEach((f, i) => {
      osc(ctx, g, f, 'sine', now + i * 0.07, now + i * 0.07 + 0.09);
    });
  },
};

export const BUILTIN_SOUNDS: SoundDefinition[] = [
  ping,
  quickPing,
  arcade,
  shamisen,
  dooWap,
  agentDone,
  codeComplete,
  longEdm,
  comeBack,
  shabalaba,
];

export function getBuiltinSound(id: string): SoundDefinition | undefined {
  return BUILTIN_SOUNDS.find((s) => s.id === id);
}
