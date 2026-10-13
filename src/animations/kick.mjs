const kickClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const kickSmooth = value => { const x = kickClamp(value); return x * x * (3 - 2 * x); };

export const KICK_DEFAULTS = Object.freeze({
  duration: 1.15, contact: 0.58, backswing: 0.34, recoveryStart: 0.72,
  back: 11, forward: 24, lift: 10,
});

function neutralPose() {
  return {
    position: 0, bob: 0, sway: 0, lean: 0, head: 0, arm: 0,
    armLeft: 0, armRight: 0, tail: 0, earLeft: 0, earRight: 0,
    gaze: { x: 0, y: 0 }, feet: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
  };
}

// The near leg (leftLeg in the artwork contract) is shared by both characters.
export function sampleKick(seconds, options = {}) {
  const settings = { ...KICK_DEFAULTS, ...options };
  const time = kickClamp(seconds, 0, settings.duration);
  let kickX = 0;
  let kickY = 0;
  let energy = 0;
  if (time < settings.backswing) {
    const p = kickSmooth(time / settings.backswing);
    kickX = -settings.back * p;
    kickY = -settings.lift * 0.55 * p;
    energy = p * 0.55;
  } else if (time < settings.contact) {
    const p = kickSmooth((time - settings.backswing) / (settings.contact - settings.backswing));
    kickX = -settings.back + (settings.back + settings.forward) * p;
    kickY = -settings.lift * (0.55 + 0.45 * Math.sin(Math.PI * p));
    energy = 0.55 + 0.45 * p;
  } else if (time < settings.recoveryStart) {
    kickX = settings.forward;
    kickY = -settings.lift;
    energy = 1;
  } else {
    const p = kickSmooth((time - settings.recoveryStart) / (settings.duration - settings.recoveryStart));
    kickX = settings.forward * (1 - p);
    kickY = -settings.lift * (1 - p);
    energy = 1 - p;
  }
  return {
    ...neutralPose(), time, total: settings.duration,
    state: time === 0 ? 'ready' : time < settings.backswing ? 'backswing' : time < settings.contact ? 'swing' : time < settings.recoveryStart ? 'contact' : time < settings.duration ? 'recovering' : 'done',
    contact: settings.contact,
    bob: -2.5 * energy, sway: -3 * energy, lean: 5 * energy, head: -2 * energy,
    armLeft: -11 * energy, armRight: 14 * energy, tail: -5 * energy,
    earLeft: -2.5 * energy, earRight: 2 * energy,
    feet: [{ x: kickX + 3 * energy, y: kickY + 2.5 * energy }, { x: 3 * energy, y: 2.5 * energy }],
  };
}
