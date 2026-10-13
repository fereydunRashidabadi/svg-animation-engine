const mouthClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

export const MOUTH_STATES = Object.freeze(['closed', 'open', 'small-o', 'smile']);
export const MOUTH_DEFAULTS = Object.freeze({
  duration: 1.6,
  rate: 7,
  phase: 0,
  loop: false,
  leadIn: 0.08,
  leadOut: 0.12,
});

// A deterministic, reusable speech rhythm. It is intentionally not tied to
// an expression or body action, so it can layer over every character pose.
const SPEECH_PATTERN = Object.freeze([
  'closed', 'open', 'small-o', 'open', 'closed', 'smile',
  'open', 'small-o', 'closed', 'open', 'smile', 'closed',
]);

export function sampleMouth(seconds, options = {}) {
  const settings = { ...MOUTH_DEFAULTS, ...options };
  if (!(settings.duration > 0) || !(settings.rate > 0)) throw new Error('Mouth duration and rate must be positive');
  const time = settings.loop
    ? Math.max(0, seconds)
    : mouthClamp(seconds, 0, settings.duration);
  const speaking = time >= settings.leadIn
    && (settings.loop || time < settings.duration - settings.leadOut);
  const frame = speaking
    ? Math.floor((time - settings.leadIn) * settings.rate + settings.phase)
    : 0;
  const index = ((frame % SPEECH_PATTERN.length) + SPEECH_PATTERN.length) % SPEECH_PATTERN.length;
  const levels = { closed: 0, open: 1, 'small-o': 0.65, smile: 0.3 };
  const fraction = speaking ? ((time - settings.leadIn) * settings.rate + settings.phase) - frame : 0;
  const blend = mouthClamp(fraction / 0.65);
  const eased = blend * blend * (3 - 2 * blend);
  const previous = levels[SPEECH_PATTERN[(index + SPEECH_PATTERN.length - 1) % SPEECH_PATTERN.length]];
  const next = levels[SPEECH_PATTERN[index]];
  const endGate = settings.loop ? 1 : mouthClamp((settings.duration - settings.leadOut - time) / 0.12);
  const startGate = mouthClamp((time - settings.leadIn) / 0.08);
  const opening = speaking ? (previous + (next - previous) * eased) * startGate * endGate : 0;
  return {
    time,
    total: settings.duration,
    speaking,
    opening,
    state: speaking ? SPEECH_PATTERN[index] : 'closed',
  };
}

// The closed contour retains the face's emotion; only jaw opening changes.
export function speechMouthShape(expression, opening) {
  const profiles = {
    normal: [23, 12, -2], happy: [26, 12, -2], sad: [20, -13, -2],
    surprised: [12, 3, 0], worried: [20, -10, 2], thinking: [13, 5, -4],
  };
  const [width, curve, tilt] = profiles[expression] ?? profiles.normal;
  const amount = mouthClamp(opening);
  const lower = curve + amount * (expression === 'surprised' ? 52 : 42);
  return {
    path: 'M' + -width + ' 0 Q0 ' + curve + ' ' + width + ' ' + tilt + ' Q0 ' + lower + ' ' + -width + ' 0Z',
    fill: amount > 0.01 ? '#513633' : 'none',
    tongue: 'M-8 ' + (lower / 2 - 4) + ' Q0 ' + (lower / 2 - 11) + ' 8 ' + (lower / 2 - 4),
    tongueVisible: amount > 0.7,
  };
}

export function applyMouthPose(svg, mouth) {
  const state = typeof mouth === 'string' ? mouth : mouth.state;
  if (!MOUTH_STATES.includes(state)) throw new Error(`Unknown mouth state: ${state}`);
  const speech = typeof mouth !== 'string' && Number.isFinite(mouth.opening);
  svg.dataset.mouth = speech ? 'auto' : state;
  svg.dataset.speaking = String(speech && mouth.speaking);
  if (speech) {
    const shape = speechMouthShape(svg.dataset.expression, mouth.opening);
    const path = svg.querySelector('.speech-shape');
    const tongue = svg.querySelector('.speech-tongue');
    if (path) { path.setAttribute('d', shape.path); path.setAttribute('fill', shape.fill); }
    if (tongue) { tongue.setAttribute('d', shape.tongue); tongue.style.display = shape.tongueVisible ? 'inline' : 'none'; }
  }
}
