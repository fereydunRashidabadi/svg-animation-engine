import { sampleKick } from './kick.mjs';
import { resolveTravel } from './travel.mjs';

const ballClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

export const BALL_ROLL_DEFAULTS = Object.freeze({
  fromX: 0, toX: 400, start: 0, duration: 1.35, radius: 54, initialRotation: 0,
});

// Ease-out travel reaches toX exactly. Put toX at a character's foot to create
// the requested automatic stop; no separate stop action is required.
export function sampleBallRoll(seconds, options = {}) {
  const settings = { ...BALL_ROLL_DEFAULTS, ...options };
  const { fromX, toX, distance } = resolveTravel(options, settings.fromX, BALL_ROLL_DEFAULTS.toX);
  if (![settings.duration, settings.radius, settings.start, settings.initialRotation].every(Number.isFinite)
    || !(settings.duration > 0) || !(settings.radius > 0)) throw new Error('Invalid ball timing, radius or rotation');
  const localTime = seconds - settings.start;
  const progress = ballClamp(localTime / settings.duration);
  const travel = 1 - Math.pow(1 - progress, 3);
  return {
    time: ballClamp(localTime, 0, settings.duration),
    total: settings.start + settings.duration,
    state: localTime <= 0 ? 'waiting' : progress < 1 ? 'rolling' : 'stopped',
    progress, x: progress === 1 ? toX : fromX + distance * travel,
    rotation: settings.initialRotation + distance * travel / settings.radius * 180 / Math.PI,
  };
}

// Pass is deliberately orchestration, not a second kind of kick.
export function samplePass(seconds, options) {
  const kick = sampleKick(seconds, options.kick);
  const ball = sampleBallRoll(seconds, {
    ...options.ball, start: options.ball?.start ?? kick.contact,
  });
  return { kick, ball, total: Math.max(kick.total, ball.total) };
}
