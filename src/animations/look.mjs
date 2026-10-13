const lookClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const lookSmooth = value => { const x = lookClamp(value); return x * x * (3 - 2 * x); };

export const LOOK_DIRECTIONS = Object.freeze({
  center: [0, 0], up: [0, -1], 'up-right': [Math.SQRT1_2, -Math.SQRT1_2],
  right: [1, 0], 'down-right': [Math.SQRT1_2, Math.SQRT1_2], down: [0, 1],
  'down-left': [-Math.SQRT1_2, Math.SQRT1_2], left: [-1, 0],
  'up-left': [-Math.SQRT1_2, -Math.SQRT1_2],
});

export const LOOK_DEFAULTS = Object.freeze({
  direction: 'right', duration: 0.32, hold: 0.55, returnDuration: 0.32,
  strength: 1, pupilX: 7, pupilY: 5, headAngle: 3,
});

export function lookDirectionFromDelta(dx, dy, deadZone = 1) {
  if (Math.hypot(dx, dy) <= deadZone) return 'center';
  const directions = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return directions[(octant + 8) % 8];
}

// Directions are screen-space. Pass mirrored:true when the artwork faces left.
export function sampleLook(seconds, options = {}) {
  const settings = { ...LOOK_DEFAULTS, ...options };
  const vector = LOOK_DIRECTIONS[settings.direction];
  if (!vector) throw new Error(`Unknown look direction: ${settings.direction}`);
  const total = settings.duration + settings.hold + settings.returnDuration;
  const time = lookClamp(seconds, 0, total);
  const amount = time < settings.duration ? lookSmooth(time / settings.duration)
    : time <= settings.duration + settings.hold ? 1
      : 1 - lookSmooth((time - settings.duration - settings.hold) / settings.returnDuration);
  const screenX = vector[0] * settings.pupilX * settings.strength * amount;
  const y = vector[1] * settings.pupilY * settings.strength * amount;
  const localX = settings.mirrored ? -screenX : screenX;
  return {
    time, total,
    state: time === 0 ? 'centered' : time < settings.duration ? 'turning' : time <= settings.duration + settings.hold ? 'looking' : time < total ? 'returning' : 'done',
    direction: settings.direction, gaze: amount === 0 ? { x: 0, y: 0 } : { x: localX, y },
    head: vector[0] * settings.headAngle * (settings.mirrored ? -1 : 1) * amount,
    position: 0, bob: 0, sway: 0, lean: 0, arm: 0, armLeft: 0, armRight: 0,
    tail: 0, earLeft: 0, earRight: 0, feet: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
  };
}
