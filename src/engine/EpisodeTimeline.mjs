import { sampleToddle, timing } from '../animations/toddle.mjs';
import { sampleWave } from '../animations/wave.mjs';
import { sampleLook } from '../animations/look.mjs';
import { sampleKick } from '../animations/kick.mjs';
import { sampleBallRoll } from '../animations/ball.mjs';
import { resolveTravel } from '../animations/travel.mjs';
import { compileAudioTimeline } from './AudioTimeline.mjs';
import { sampleMouth } from '../animations/mouth.mjs';
import {samplePeek,sampleShrug,sampleHappyHop} from '../animations/expressive.mjs';
import {sampleSeriesIntro} from '../animations/series-intro.mjs';
import {prependSeriesIntro,setSeriesIntroAudio} from './SeriesIntro.mjs';
import {PROP_CUES,compilePropTimeline,samplePropTimeline} from './PropTimeline.mjs';

const episodeClamp = (n, a, b) => Math.min(b, Math.max(a, n));
const episodeBodyTypes = new Set(['toddle', 'wave', 'kick','peek','shrug','happyHop']);

export function validateCameraFrame(frame, sceneFrame) {
  if (!Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isFinite)) throw new Error('Camera frame must be [x,y,width,height]');
  const [x,y,width,height] = frame;
  const [sx,sy,sw,sh] = sceneFrame;
  if (width <= 0 || height <= 0 || Math.abs(width / height - sw / sh) > 1e-6) throw new Error('Camera frame must preserve the scene aspect ratio');
  if (x < sx - 1e-6 || y < sy - 1e-6 || x + width > sx + sw + 1e-6 || y + height > sy + sh + 1e-6) throw new Error('Camera frame must stay inside the scene');
  return [...frame];
}

// Scene data schedules deterministic samplers; source artwork stays separate.
export function compileEpisode(source, rigs, {audioDurations = {}} = {}) {
  const normalized=source.seriesIntro?{...source,seriesIntro:setSeriesIntroAudio(source.seriesIntro,source.introAudio??true)}:source;
  const audio = prependSeriesIntro(compileAudioTimeline(normalized, audioDurations),normalized.seriesIntro,audioDurations);
  const data = audio.data;
  if (!(data.duration > 0)) throw new Error('Episode duration must be positive');
  let cameraFrame = validateCameraFrame(data.viewBox, data.viewBox);
  const positions = Object.fromEntries(Object.entries(data.actors).map(([id, actor]) => [id, actor.x]));
  const trackEnds = {};
  let ballX = data.ball?.x, rotation = data.ball?.rotation;
  const cues = data.cues.map((cue, order) => ({ ...cue, order }))
    .sort((a, b) => a.at - b.at || a.order - b.order);
  for (const cue of cues) {
    if (!['set', 'title', 'look', 'roll', 'camera','mouth', ...episodeBodyTypes,...PROP_CUES].includes(cue.type)) throw new Error('Unknown episode cue: ' + cue.type);
    if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > data.duration) throw new Error('Invalid cue time');
    if (cue.type === 'camera') {
      cue.duration = cue.duration ?? 0;
      if (!Number.isFinite(cue.duration) || cue.duration < 0 || cue.at + cue.duration > data.duration) throw new Error('Invalid camera duration');
      if ((trackEnds.camera ?? 0) > cue.at + 1e-8) throw new Error('Overlapping camera cues');
      trackEnds.camera = cue.at + cue.duration;
      cue.fromFrame = [...cameraFrame];
      const target = typeof cue.frame === 'string' ? data.cameraFrames?.[cue.frame] : cue.frame;
      cue.toFrame = validateCameraFrame(target, data.viewBox);
      cameraFrame = cue.toFrame;
      continue;
    }
    if(PROP_CUES.has(cue.type)){
      if(!(cue.duration>0)||cue.at+cue.duration>data.duration)throw new Error('Invalid prop cue duration');
      continue;
    }
    if (!['roll', 'title'].includes(cue.type) && !data.actors[cue.actor]) throw new Error('Unknown actor: ' + cue.actor);
    if (['set', 'title'].includes(cue.type)) continue;
    if (!(cue.duration > 0) || cue.at + cue.duration > data.duration) throw new Error('Invalid cue duration');
    const track = cue.type === 'roll' ? 'ball' : cue.actor + (cue.type === 'look' ? '-look' : cue.type==='mouth'?'-mouth':'-body');
    if ((trackEnds[track] ?? 0) > cue.at + 1e-8) throw new Error('Overlapping cues on ' + track);
    trackEnds[track] = cue.at + cue.duration;
    if(cue.type==='peek')samplePeek(0,{...cue,mirrored:false});
    if(cue.type==='shrug')sampleShrug(0,cue);
    if(cue.type==='happyHop')sampleHappyHop(0,cue);
    if(cue.type==='mouth'&&audio.events.some(event=>event.mouthActors.includes(cue.actor)&&event.at<cue.at+cue.duration&&event.at+event.duration>cue.at))throw new Error('Conflicting mouth cue/audio');
    if (cue.type === 'toddle') {
      if (cue.repeats !== undefined) throw new Error('Walk repeats are obsolete; specify distance or toX');
      if(cue.backward!==undefined&&typeof cue.backward!=='boolean')throw new Error('Walk backward must be boolean');
      Object.assign(cue, resolveTravel(cue, positions[cue.actor]));
      positions[cue.actor] = cue.toX;
      const scale = data.actors[cue.actor].scale;
      if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('Invalid actor scale');
      cue.settings = { distance: (cue.backward?-1:1)*Math.abs(cue.distance) / scale, duration: cue.duration,
        cadence: cue.cadence ?? 7, bounce: cue.bounce ?? 4, rest: 0, settle: 0.25 };
      cue.walkTiming = timing(cue.settings);
    }
    if (cue.type === 'roll') {
      if(!data.ball)throw new Error('Roll needs a ball');
      Object.assign(cue, resolveTravel(cue, ballX));
      cue.initialRotation = rotation;
      ballX = cue.toX;
      rotation = sampleBallRoll(cue.duration, { fromX: cue.fromX, toX: cue.toX,
        duration: cue.duration, radius: data.ball.radius, initialRotation: rotation }).rotation;
    }
  }
  for (const id of Object.keys(data.actors)) if (!rigs[id]) throw new Error('Missing character rig: ' + id);
  const episode={ data, rigs, cues, audioEvents:audio.events, blocks:audio.blocks,
    ducking:audio.ducking, masterVolume:audio.masterVolume };
  episode.propTimeline=compilePropTimeline(data,cues,rigs,t=>sampleEpisodeBase(episode,t));
  return episode;
}

function sampleEpisodeBase(episode, seconds) {
  const { data, rigs, cues } = episode;
  const time = episodeClamp(seconds, 0, data.duration);
  const actors = Object.fromEntries(Object.entries(data.actors).map(([id, actor]) =>
    [id, { ...actor, pose: sampleWave(0, rigs[id].motion.wave) }]));
  let ball = data.ball?{ ...data.ball }:null, titleVisible = false;
  let cameraFrame = [...data.viewBox];
  const looks = [];
  for (const cue of cues) {
    if (cue.at > time) break;
    const actor = actors[cue.actor];
    const elapsed = time - cue.at;
    const active = elapsed < cue.duration;
    if (cue.type === 'camera') {
      const progress = cue.duration === 0 ? 1 : episodeClamp(elapsed / cue.duration, 0, 1);
      const blend = progress * progress * (3 - 2 * progress);
      cameraFrame = progress === 1 ? [...cue.toFrame] : cue.fromFrame.map((value, index) => value + (cue.toFrame[index] - value) * blend);
    } else if (cue.type === 'set') {
      for (const key of ['facing', 'expression', 'visible']) if (cue[key] !== undefined) actor[key] = cue[key];
    } else if (cue.type === 'title') {
      titleVisible = cue.visible;
    } else if (cue.type === 'roll') {
      ball = { ...ball, ...sampleBallRoll(elapsed, { fromX: cue.fromX, toX: cue.toX,
        duration: cue.duration, initialRotation: cue.initialRotation, radius: ball.radius, start: 0 }) };
    } else if (cue.type === 'toddle') {
      if (cue.distance !== 0) actor.facing = (cue.distance < 0)!==Boolean(cue.backward) ? 'left' : 'right';
      if (!active) { actor.x = cue.toX; continue; }
      actor.pose = sampleToddle(elapsed, cue.settings, rigs[cue.actor].motion);
      actor.x = actor.pose.progress === 1 ? cue.toX : cue.fromX + cue.distance * actor.pose.progress;
    } else if (cue.type === 'wave' && active) {
      actor.pose = sampleWave(elapsed / cue.duration * rigs[cue.actor].motion.wave.duration, rigs[cue.actor].motion.wave);
    } else if (cue.type === 'kick' && active) {
      actor.pose = sampleKick(elapsed, { duration: cue.duration });
    } else if (cue.type === 'peek' && active) actor.pose=samplePeek(elapsed,{...cue,mirrored:actor.facing==='left'});
    else if(cue.type==='shrug'&&active)actor.pose=sampleShrug(elapsed,cue);
    else if(cue.type==='happyHop'&&active)actor.pose=sampleHappyHop(elapsed,cue);
    else if(cue.type==='mouth'&&active)actor.mouth=sampleMouth(elapsed,{duration:cue.duration});
    else if (cue.type === 'look' && active) looks.push(cue);
  }
  // Gaze composes over the body, including walking and mirrored waving.
  for (const cue of looks) {
    const actor = actors[cue.actor];
    const look = sampleLook(time - cue.at, { direction: cue.direction, duration: .25,
      hold: cue.duration - .5, returnDuration: .25, mirrored: actor.facing === 'left' });
    actor.pose = { ...actor.pose, gaze: look.gaze, head: actor.pose.head + look.head };
  }
  const chapter = data.chapters.filter(item => item.start <= time).at(-1);
  for (const event of episode.audioEvents) {
    if (time < event.at || time >= event.at + event.duration) continue;
    event.mouthActors.forEach((id,index) => {
      actors[id].mouth = sampleMouth(time-event.at,{duration:event.duration,phase:index*2});
    });
  }
  const intro=data.seriesIntro&&time<data.introDuration?sampleSeriesIntro(time,data.seriesIntro,rigs):null;
  return { time, actors, ball, titleVisible, chapter, intro,camera: {viewBox: intro?[...data.viewBox]:cameraFrame} };
}

export function sampleEpisode(episode,seconds){
  const frame=sampleEpisodeBase(episode,seconds);
  const sampled=samplePropTimeline(episode.propTimeline,frame.time,frame);
  return {...frame,props:sampled.props,handContacts:sampled.targets};
}
