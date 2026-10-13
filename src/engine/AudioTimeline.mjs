const audioChannels = new Set(['narration', 'music', 'sfx', 'character']);
const audioFinite = (value, label, minimum = 0) => {
  if (!Number.isFinite(value) || value < minimum) throw new Error('Invalid ' + label);
  return value;
};

export function validateAudioPath(file) {
  if (typeof file !== 'string' || !/^audio\/.+\.(mp3|wav|ogg|m4a|aac|opus|flac|webm)$/i.test(file)
    || /[\\:%?#\u0000-\u001f]/.test(file)
    || file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid local audio path: ' + file);
  }
  return file;
}

function audioSources(data) {
  if (data.audio !== undefined && (!data.audio || typeof data.audio !== 'object' || Array.isArray(data.audio))) throw new Error('Invalid audio configuration');
  const array = (value, label) => {
    if (value !== undefined && !Array.isArray(value)) throw new Error('Invalid ' + label);
  };
  array(data.audio?.events, 'audio events'); array(data.blocks, 'blocks');
  for (const block of data.blocks ?? []) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('Invalid block');
    array(block.actions,'block actions');array(block.audio,'block audio');
  }
  const sources = [...(data.audio?.events ?? [])];
  for (const block of data.blocks ?? []) {
    if (block.narration) sources.push({...block.narration, channel: 'narration'});
    sources.push(...(block.audio ?? []));
  }
  return sources;
}

export function resolveAudioSource(event, manifest = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid audio event');
  if ((event.file !== undefined) === (event.asset !== undefined)) throw new Error('Audio event needs exactly one file or manifest asset');
  if (event.file !== undefined) return validateAudioPath(event.file);
  if (typeof event.asset !== 'string' || !Object.hasOwn(manifest, event.asset)) throw new Error('Unknown audio asset: ' + event.asset);
  const entry = manifest[event.asset];
  return validateAudioPath(typeof entry === 'string' ? entry : entry?.file);
}

export function collectAudioAssets(data) {
  const manifest = data.audio?.manifest ?? {};
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid audio manifest');
  for (const entry of Object.values(manifest)) validateAudioPath(typeof entry === 'string' ? entry : entry?.file);
  return [...new Set([...audioSources(data).map(event => resolveAudioSource(event, manifest)),...(data.seriesIntro&&data.introAudio!==false?collectAudioAssets(data.seriesIntro):[])])];
}

export function compileAudioTimeline(source, durations = {}) {
  collectAudioAssets(source);
  const manifest = source.audio?.manifest ?? {};
  const actors = source.actors ?? {};
  const pending = [];
  const blocks = [];
  const cues = [...(source.cues ?? [])];
  const chapters = [...(source.chapters ?? [])];
  const ids = new Set();
  const blockIds = new Set();
  const ducking = {level: .25, attack: .15, release: .35, ...(source.audio?.ducking ?? {})};
  for (const key of ['level', 'attack', 'release']) audioFinite(ducking[key], 'ducking ' + key);
  if (ducking.level > 1) throw new Error('Invalid ducking level');
  const masterVolume = audioFinite(source.audio?.volume ?? 1, 'audio volume');
  if (masterVolume > 1) throw new Error('Invalid audio volume');

  function addEvent(raw, at, defaultId) {
    const event = {...raw, id: raw.id ?? defaultId, at};
    if (typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new Error('Duplicate or invalid audio event id: ' + event.id);
    ids.add(event.id);
    if (!audioChannels.has(event.channel)) throw new Error('Unknown audio channel: ' + event.channel);
    audioFinite(at, 'audio offset');
    event.file = resolveAudioSource(raw, manifest);
    event.assetDuration = durations[event.file];
    if (!Number.isFinite(event.assetDuration) || event.assetDuration <= 0) throw new Error('Missing measured audio duration: ' + event.file);
    if (event.channel === 'character' && !Object.hasOwn(actors, event.actor)) throw new Error('Unknown character audio actor: ' + event.actor);
    const folder = event.channel === 'narration' ? /^audio\/episodes\/[^/]+\/narration\//
      : event.channel === 'character' ? new RegExp('^audio/characters/' + event.actor + '/')
      : new RegExp('^audio/' + event.channel + '/');
    if (!folder.test(event.file)) throw new Error('Audio file does not match channel: ' + event.file);
    if (event.loop !== undefined && typeof event.loop !== 'boolean') throw new Error('Invalid audio loop');
    event.loop = event.loop ?? false;
    if (event.loop && event.channel !== 'music') throw new Error('Only music can loop');
    event.mediaOffset = audioFinite(event.mediaOffset ?? 0, 'media offset');
    if (event.mediaOffset >= event.assetDuration) throw new Error('Media offset exceeds recording');
    const remaining = event.assetDuration - event.mediaOffset;
    if (event.loop && event.duration === undefined) event.duration = null;
    else {
      event.duration = event.duration ?? remaining;
      audioFinite(event.duration, 'audio duration', Number.MIN_VALUE);
      if (!event.loop && event.duration > remaining + 1e-6) throw new Error('Audio event exceeds recording: ' + event.id);
    }
    event.volume = audioFinite(event.volume ?? 1, 'event volume');
    if (event.volume > 1) throw new Error('Invalid event volume');
    event.fadeIn = audioFinite(event.fadeIn ?? 0, 'fade in');
    event.fadeOut = audioFinite(event.fadeOut ?? 0, 'fade out');
    event.mouthActors = event.mouth === undefined ? [] : Array.isArray(event.mouth) ? [...event.mouth] : [event.mouth];
    if (new Set(event.mouthActors).size !== event.mouthActors.length) throw new Error('Duplicate mouth actor');
    for (const actor of event.mouthActors) {
      if (!Object.hasOwn(actors, actor)) throw new Error('Unknown mouth actor: ' + actor);
      if (event.channel === 'music' || (event.channel === 'character' && actor !== event.actor)) throw new Error('Invalid mouth target for channel');
    }
    pending.push(event);
    return event.duration === null ? at : at + event.duration;
  }

  let blockStart = 0;
  for (const block of source.blocks ?? []) {
    if (typeof block.id !== 'string' || !block.id || blockIds.has(block.id)) throw new Error('Duplicate or invalid block id');
    blockIds.add(block.id);
    let end = blockStart + audioFinite(block.minDuration ?? 0, 'minimum block duration');
    if (block.narration) {
      if (block.narration.at !== undefined) throw new Error('Block narration uses offset, not at');
      end = Math.max(end, addEvent({...block.narration, channel:'narration'},
        blockStart + audioFinite(block.narration.offset ?? 0, 'narration offset'), block.id + '-narration'));
    }
    for (const [index, action] of (block.actions ?? []).entries()) {
      if (action.at !== undefined) throw new Error('Block actions use offset, not at');
      const offset = audioFinite(action.offset ?? 0, 'action offset');
      const {offset: ignored, ...cue} = action;
      const duration = action.duration ?? (['set','title','camera'].includes(action.type) ? 0 : NaN);
      audioFinite(duration, 'action duration');
      if (!['set','title','camera'].includes(action.type) && duration === 0) throw new Error('Action duration must be positive');
      cues.push({...cue, at:blockStart + offset});
      end = Math.max(end, blockStart + offset + duration);
    }
    for (const [index, event] of (block.audio ?? []).entries()) {
      if (event.at !== undefined) throw new Error('Block audio uses offset, not at');
      if (event.loop && event.duration === undefined) throw new Error('Looping block music requires explicit duration');
      end = Math.max(end, addEvent(event, blockStart + audioFinite(event.offset ?? 0, 'audio offset'), block.id + '-audio-' + index));
    }
    if (!(end > blockStart)) throw new Error('Empty block needs positive minDuration');
    blocks.push({id:block.id, start:blockStart, end, duration:end-blockStart});
    if (block.title) chapters.push({start:blockStart, title:block.title, label:block.label ?? block.title});
    blockStart = end;
  }
  for (const [index, event] of (source.audio?.events ?? []).entries()) {
    if (event.offset !== undefined) throw new Error('Global audio uses at, not offset');
    addEvent(event, audioFinite(event.at, 'audio start'), 'audio-' + index);
  }
  const inferredDuration = Math.max(source.duration === undefined ? 0 : audioFinite(source.duration, 'episode duration'),
    blockStart, ...cues.map(cue => audioFinite(cue.at, 'cue start') + audioFinite(cue.duration ?? 0, 'cue duration')),
    ...pending.map(event => event.at + (event.duration ?? 0)));
  const duration = source.blocks?.length || source.duration === undefined ? inferredDuration : source.duration;
  if (!(duration > 0)) throw new Error('Episode needs a positive duration');
  const events = pending.map(event => {
    const resolved = {...event, duration:event.duration ?? duration-event.at};
    if (!(resolved.duration > 0) || resolved.at + resolved.duration > duration + 1e-6 || resolved.fadeIn + resolved.fadeOut > resolved.duration + 1e-6) throw new Error('Invalid audio fades or interval');
    return resolved;
  }).sort((a,b)=>a.at-b.at);
  const ends = new Map();
  for (const event of events) {
    const tracks = event.channel === 'narration' || event.channel === 'music' ? [event.channel]
      : event.channel === 'character' ? ['character-' + event.actor] : [];
    tracks.push(...event.mouthActors.map(actor=>'mouth-' + actor));
    for (const track of tracks) {
      if ((ends.get(track) ?? 0) > event.at + 1e-8) throw new Error('Conflicting audio events on ' + track);
      ends.set(track,event.at+event.duration);
    }
  }
  chapters.sort((a,b)=>a.start-b.start);
  if (!chapters.length) chapters.push({start:0,title:source.title ?? 'Episode',label:source.title ?? 'Episode'});
  for (const chapter of chapters) if (!Number.isFinite(chapter.start) || chapter.start < 0 || chapter.start > duration) throw new Error('Invalid chapter start');
  return {data:{...source,duration,cues,chapters}, events, blocks, ducking, masterVolume};
}

export function audioEventGain(event, time, events, ducking, masterVolume = 1) {
  const elapsed = time-event.at;
  if (elapsed < 0 || elapsed >= event.duration) return 0;
  let gain = event.volume * masterVolume;
  if (event.fadeIn) gain *= Math.min(1,elapsed/event.fadeIn);
  if (event.fadeOut) gain *= Math.min(1,(event.duration-elapsed)/event.fadeOut);
  if (event.channel === 'music') {
    let duck = 1;
    for (const voice of events.filter(item=>item.channel==='narration'||item.channel==='character')) {
      const end = voice.at+voice.duration;
      if (time < voice.at || time >= end+ducking.release) continue;
      const amount = time < end ? ducking.attack === 0 ? 1 : Math.min(1,(time-voice.at)/ducking.attack)
        : ducking.release === 0 ? 0 : 1-(time-end)/ducking.release;
      duck = Math.min(duck,1-(1-ducking.level)*amount);
    }
    gain *= duck;
  }
  return Math.max(0,Math.min(1,gain));
}
