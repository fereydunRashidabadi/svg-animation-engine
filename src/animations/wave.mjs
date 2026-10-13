const waveClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const waveSmooth = value => { const x = waveClamp(value); return x * x * (3 - 2 * x); };

// Reusable near-arm greeting. Timings and character flavor live in character.json.
// Sampling at any time makes pause, replay and scrubbing deterministic.
export function sampleWave(seconds, profile) {
  const { duration, raise, lower, raiseAngle, wiggleAngle, bodyLift, headTilt, tailSwing, earSway } = profile;
  const time = waveClamp(seconds, 0, duration);
  const raised = waveSmooth(time / raise) * waveSmooth((duration - time) / lower);
  const hold = duration - raise - lower;
  const holdTime = waveClamp(time - raise, 0, hold);
  const wiggleGate = waveSmooth((time - raise) / 0.08) * waveSmooth((duration - lower - time) / 0.08);
  const wiggle = Math.sin(4 * Math.PI * holdTime / hold) * wiggleGate;
  const bob = -bodyLift * Math.sin(Math.PI * time / duration) * raised;
  const sway = 0;
  return {
    position: 0, bob, sway, lean: 0,
    head: headTilt * raised,
    arm: 0,
    armLeft: raiseAngle * raised + wiggleAngle * wiggle,
    armRight: 0,
    tail: tailSwing * raised + 1.2 * wiggle,
    earLeft: earSway * raised - 1.5 * wiggle,
    earRight: earSway * 0.7 * raised + wiggle,
    feet: [{ x: 0, y: -bob }, { x: 0, y: -bob }],
  };
}
