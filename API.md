# Public engine API

Read ENGINE_GUIDE.md first. Private artwork/stories are not shipped.

| Module | Implemented contract |
| --- | --- |
| EpisodeTimeline.mjs | compileEpisode(source, rigs, {audioDurations}); sampleEpisode(compiled, seconds); validateCameraFrame |
| CharacterMotion.mjs | getCharacterParts; applyCharacterPose; CharacterMotion DOM adapter |
| AudioTimeline.mjs | compileAudioTimeline, collectAudioAssets, validateAudioPath, audioEventGain |
| AudioManager.mjs | Browser audio loading, transport and mixing |
| PropTimeline.mjs | compilePropTimeline / samplePropTimeline; resolved geometry required |
| PropView.mjs | SVG prop rendering and depth ordering |
| VideoRecorder.mjs | Browser MP4 export; VIDEO_EXPORT, exportFramePlan, encodeEpisodeFrames |
| SeriesIntro.mjs / SeriesIntroView.mjs | Optional resolved three-second intro and SVG view |
| src/animations/ | Pure toddle, wave, look, kick, ball roll/pass, mouth, expressive, prop, environment and intro samplers |

Engine modules live in src/engine. Read relevant source for exact options.
Cues: set, title, toddle, wave, look, kick, roll, camera, mouth, peek, shrug,
happyHop, plus PROP_CUES exported by PropTimeline.
Body, gaze and mouth compose; overlapping body/camera cues fail validation.
No throw, general jumping, phoneme lip sync or 3D skeletal engine is implemented.

Camera frames are [x,y,width,height], preserve aspect ratio and stay in bounds.
Actor IDs are arbitrary map keys. Travel uses distance or toX and duration;
backward:true supports retreats. Prop x/y anchor the origin, unlike top-left
static artwork placement. Caller resolves asset and contact geometry.

Audio paths are relative audio/... paths. Pass measured durations keyed by path.
Blocks use action/audio offset; absolute cues use at. No audio generation.
Export defaults: 1920x1080, 60 fps, H.264, stereo AAC at 48 kHz. Local codecs
and license notices are retained. Browser export requires an application frame
painter, decoded audio, codec support and correct served vendor URLs.

The renderer/contact system retains some legacy coordinate assumptions; adopting
substantially different proportions requires inspecting the relevant modules.
No asset registry, studio UI, content builder or production episode is shipped.
