# Codex guide: create your own animation project

## Scope and entry point

This repository contains reusable engine source, not an editor or franchise.
Read API.md and docs/ENGINE_QUALITY.md. No original character material is required.
Do not infer personality from a shared motion sampler.

Run node --test tests/engine-public.test.mjs with Node >=22.
Engine modules are ES modules usable in a served browser or through your bundler.
No build step or installed dependencies are required for numerical sampling.
Implement your own application/content pipeline; project-specific builders are
deliberately absent.

## Architecture

- src/animations: pure functions of time, options and rig geometry; no DOM/media.
- src/engine: compiles timelines, reconstructs frames, applies SVG poses, manages
  audio and export. Keep story decisions outside these modules.
- Your app: transport UI, scene assembly, loading, rendering and content tooling.
- Your content: original SVG artwork, rigs, scenes, story JSON and supplied audio.
- Your outputs: rebuildable previews and explicitly exported media.

The ignore file excludes root additions by default. Explicitly allow your own
app/content if you intend to share it. Review staged files. Engine directories
are allowed recursively: never put artwork, recordings, stories or personality
profiles inside them.

## Author a new SVG rig

Choose an original actor ID and draw self-contained SVG art with addressable
groups. Supply a rig per actor with your own geometry and performance settings.
CharacterMotion directly reads these parts:
root, body, head, leftArm, rightArm, leftLeg, rightLeg, tail, leftEar, rightEar,
leftPupil, rightPupil. Every accessed part must exist; use empty SVG groups for
unused ears or tails. The rig maps semantic part names to SVG IDs.

Supply viewBox:[x,y,w,h], groundAnchor:[x,y], joints with pivot:[x,y] for head,
arms, legs, ears and tail; motion.feet.leftLeg/rightLeg:[x,y]; motion.wave.
Additional walking fields are read by src/animations/toddle.mjs.
Wave fields: duration, raise, lower, raiseAngle, wiggleAngle, bodyLift, headTilt,
tailSwing, earSway. Duration must exceed raise+lower. Use your own values;
timing is seconds, distances SVG units and rotations degrees.

The CharacterMotion DOM adapter expects .character-art inside the actor and an
.art-wrap wrapper. For your scene renderer, use getCharacterParts/applyCharacterPose
then apply world placement and mirroring in an outer wrapper. Joint transforms
must remain separate from placement. Expression and blink artwork/styling are
application responsibilities. Read applyMouthPose in animations/mouth.mjs for its
required SVG selectors. Inspect fallback body pivot/contact assumptions when
changing proportions; automatic retargeting is not provided.

Object interactions additionally need interaction.hands.near/far (part, anchor,
carry), bodyPivot and maxReachScale as applicable. Read PropTimeline.mjs and
prop-motion.mjs for resolved geometry and action options.

## Minimal numerical story

This silent example needs no SVG files:

~~~js
import {compileEpisode, sampleEpisode} from './src/engine/EpisodeTimeline.mjs';
const rigs = {
  hero: {motion: {wave: {
    duration: 2, raise: .4, lower: .4, raiseAngle: 90, wiggleAngle: 8,
    bodyLift: 2, headTilt: 2, tailSwing: 0, earSway: 0
  }}}
};
const source = {
  title: 'My Story', duration: 4, viewBox: [0,0,1920,1080],
  actors: {hero: {x: 600, groundY: 900, scale: 1, facing: 'right',
    expression: 'normal', visible: true}},
  cues: [{type: 'wave', actor: 'hero', at: 1, duration: 2}],
  chapters: []
};
const episode = compileEpisode(source, rigs);
const frame = sampleEpisode(episode, 1.5);
~~~

This minimal rig supports numerical wave sampling only. Rendering and other
actions require complete metadata. Your render loop reads one episode clock,
samples a frame, paints actor world transforms/poses, props and camera.
Seeking resamples time instead of accumulating transforms.

Use sequential blocks for speech-dependent stories, with actions/audio offsets
and minDuration. Read AudioTimeline for the exact schema. Load real media first,
pass decoded/measured audioDurations keyed by file path, and never guess durations
or truncate speech. Body, gaze and mouth are independent tracks.

## Scene, props, audio and intro

Assemble original SVG scenes and prefix IDs to avoid collisions. Resolve artwork
and geometry before compilation. Props are keyed instances with origin, grip,
contact hull, positive scale and floorY; inspect the prop modules before using
pickup, placement, handover, movement or gravity. No registry ships.

Audio channels: narration, character, music, sfx. Use user-supplied recordings,
without synthesis/provider integration. Mouth motion is rhythmic rather than
phoneme-aligned. AudioManager/rendering share transport, seek and rate state.

Omit seriesIntro for no intro. The optional existing intro path requires resolved
artwork/settings and exactly three seconds. It is not an arbitrary-duration intro
builder. Supply your own title metadata, artwork and optional audio.

## Export and extension workflow

Serve your app locally. VideoRecorder dynamically imports vendor/mediabunny
relative to baseURL. Read its methods before wiring export: provide a frame
painter and required scene/audio inputs. It samples each frame on a fixed time
grid instead of recording the screen in real time.

Discuss new animation behaviors before implementation. Existing fixes and
requested asset refactors may proceed. Update API.md for changed contracts.
Run numerical tests, inspect key poses/contact/mirroring/camera transitions,
listen to supplied audio, and verify pause/restart/seeks/rate changes.
For export changes, inspect a real encoded file for dimensions, timestamps,
audio sync and standard-player playback.

Maintainer-only local material is ignored. Previous project API/README and
package settings are preserved under docs/private/ and package.local.json.
They are not dependencies of a fresh clone. Local legacy previews can still
be built with node scripts/build.mjs and served with node scripts/serve.mjs.
Public npm scripts intentionally expose only the independent engine tests.
