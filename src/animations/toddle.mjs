const TAU = Math.PI * 2;
const clamp = (x, low = 0, high = 1) => Math.min(high, Math.max(low, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const DEFAULTS = Object.freeze({ cadence: 5.6, speed: 58, bounce: 4 });
export const CYCLES = 10;
export const REST = 0.8;
export const SETTLE = 1;
export function timing(options = DEFAULTS) {
  const settings = { ...DEFAULTS, ...options };
  const explicitDuration = settings.duration !== undefined;
  const rest = settings.rest ?? (explicitDuration ? 0 : REST);
  const settle = settings.settle ?? (explicitDuration ? 0.25 : SETTLE);
  if (![settings.cadence, settings.speed, settings.bounce, rest, settle].every(Number.isFinite)
    || settings.cadence <= 0 || settings.speed <= 0 || settings.bounce < 0 || rest < 0 || settle < 0) {
    throw new Error('Invalid walking settings');
  }
  if (settings.distance !== undefined && !Number.isFinite(settings.distance)) throw new Error('Invalid walk distance');
  if (explicitDuration && (!Number.isFinite(settings.duration) || settings.duration <= rest + settle)) {
    throw new Error('Walk duration must exceed rest plus settle');
  }
  const walk = explicitDuration ? settings.duration - rest - settle
    : settings.distance !== undefined ? Math.abs(settings.distance) / settings.speed : CYCLES * 2 / settings.cadence;
  const distance = settings.distance ?? settings.speed * walk;
  const cycles = explicitDuration || settings.distance !== undefined ? Math.max(1, Math.ceil(walk * settings.cadence / 2)) : CYCLES;
  return { walk, total: rest + walk + settle, distance, rest, settle, cycles };
}
// Integral of a cosine velocity ramp. Position and gait share this clock,
// so feet stay planted even while the character accelerates and decelerates.
export function travelProgress(t) {
  t = clamp(t);
  const ramp = 0.12;
  const integral = x => 0.5 * (x - ramp / Math.PI * Math.sin(Math.PI * x / ramp));
  if (t < ramp) return integral(t) / (1 - ramp);
  if (t > 1 - ramp) return 1 - integral(1 - t) / (1 - ramp);
  return (t - ramp / 2) / (1 - ramp);
}
export function footPose(phase, stride, lift) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return { x: stride * (0.25 - p), y: 0, planted: true };
  const swing = (p - 0.5) * 2;
  return { x: stride * (-0.25 + 0.5 * smooth(swing)), y: -lift * Math.sin(Math.PI * swing), planted: false };
}
export function sampleToddle(seconds, settings = DEFAULTS, profile = {}) {
  settings = { ...DEFAULTS, ...settings };
  const { walk, total, distance, rest, settle: settleDuration, cycles } = timing(settings);
  const elapsed = seconds - rest;
  const u = walk === 0 ? (elapsed < 0 ? 0 : 1) : clamp(elapsed / walk);
  const progress = travelProgress(u);
  const direction = distance < 0 ? -1 : 1;
  // Signed local travel reverses the gait clock, including the planted step.
  const cycle = direction * cycles * progress;
  const phase = TAU * cycle;
  const envelope = distance === 0 ? 0 : smooth(elapsed / 0.22) * smooth((walk - elapsed) / 0.3);
  const stride = Math.abs(distance) / cycles;
  const bounce = settings.bounce * (profile.bounceScale ?? 1);
  const bob = -bounce * (0.5 - 0.5 * Math.cos(phase * 2)) * envelope;
  const sway = Math.sin(phase) * (profile.sway ?? 1) * envelope;
  const after = Math.max(0, elapsed - walk);
  const settle = distance !== 0 && elapsed >= walk && after < settleDuration ? Math.sin(after * 13) * Math.exp(-after * 5) * (1 - smooth(after / settleDuration)) : 0;
  const feet = [footPose(cycle + 0.25, stride, profile.lift ?? 9), footPose(cycle + 0.75, stride, profile.lift ?? 9)];
  return {
    time: clamp(seconds, 0, total), total, progress,
    state: seconds < rest ? 'ready' : elapsed < walk ? 'walking' : seconds < total ? 'settling' : 'done',
    position: distance * (progress - 0.5), bob, sway,
    lean: direction * (profile.lean ?? 0) * envelope,
    head: -Math.sin(phase - 0.3) * (profile.head ?? 1) * envelope,
    arm: Math.sin(phase) * (profile.arm ?? 10) * envelope,
    tail: Math.sin(phase - 0.8) * (profile.tail ?? 3) * envelope + settle * 2,
    earLeft: Math.sin(phase - 0.8) * (profile.ears ?? 0) * envelope + settle * (profile.ears ?? 0),
    earRight: Math.sin(phase - 1.2) * (profile.ears ?? 0) * 0.75 * envelope + settle * (profile.ears ?? 0) * 0.7,
    feet: feet.map(foot => ({ ...foot, x: foot.x * envelope - sway, y: foot.y * envelope - bob })),
  };
}
