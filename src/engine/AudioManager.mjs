import {collectAudioAssets, audioEventGain} from './AudioTimeline.mjs';

// No synthesis: this class owns only user-supplied local media playback.
export class AudioManager {
  constructor({createMedia = () => new Audio(), baseURL = document.baseURI,
    now = () => performance.now()/1000, onError = () => {}, metadataTimeout = 15000} = {}) {
    this.createMedia=createMedia; this.baseURL=baseURL; this.now=now; this.onError=onError;
    this.metadataTimeout=metadataTimeout; this.probes=new Map(); this.voices=[];
    this.durations={}; this.time=0; this.rate=1; this.playing=false; this.lastNow=null; this.error=null;
  }
  url(file) { return new URL(file.split('/').map(encodeURIComponent).join('/'),this.baseURL).href; }
  async prepare(data) {
    this.dispose();
    this.error=null;
    const files=collectAudioAssets(data);
    const results=await Promise.allSettled(files.map(file=>new Promise((resolve,reject)=>{
      const media=this.createMedia();
      this.probes.set(file,media);
      let timeout;
      const clean=()=>{ clearTimeout(timeout); media.removeEventListener('loadedmetadata',loaded); media.removeEventListener('error',failed); };
      const loaded=()=>{
        if (!(Number.isFinite(media.duration)&&media.duration>0)) { failed(); return; }
        clean(); this.durations[file]=media.duration; resolve();
      };
      const failed=()=>{clean();reject(new Error('Cannot load local audio: '+file));};
      media.addEventListener('loadedmetadata',loaded);media.addEventListener('error',failed);
      timeout=setTimeout(failed,this.metadataTimeout);
      media.preload='auto'; media.src=this.url(file); media.load();
      if(media.readyState>=1) loaded();
    })));
    const failures=results.filter(result=>result.status==='rejected');
    if(failures.length) {this.dispose();throw new Error(failures.map(result=>result.reason.message).join('; '));}
    return {...this.durations};
  }
  configure(compiled) {
    this.pause();
    for(const voice of this.voices) this.releaseVoice(voice);
    this.voices=[];
    this.timeline=compiled;
    const used=new Set();
    for(const event of compiled.audioEvents ?? []) {
      const media=!used.has(event.file)&&this.probes.has(event.file) ? this.probes.get(event.file) : this.createMedia();
      used.add(event.file);
      if(!media.src) {media.preload='auto';media.src=this.url(event.file);media.load();}
      media.loop=event.loop;
      const voice={event,media,active:false,pending:false,waiting:false,token:0};
      voice.failed=()=>this.fail(new Error('Audio playback failed: '+event.file));
      voice.waited=()=>{if(this.playing&&voice.active) voice.waiting=true;};
      voice.recovered=()=>{voice.waiting=false;};
      media.addEventListener('error',voice.failed);
      media.addEventListener('waiting',voice.waited);
      media.addEventListener('playing',voice.recovered);
      media.addEventListener('canplay',voice.recovered);
      this.voices.push(voice);
    }
    this.time=0; this.lastNow=null;
  }
  fail(error) {
    if(this.error) return;
    this.error=error;this.pause();this.onError(error);
  }
  releaseVoice(voice) {
    voice.token++;voice.pending=false;voice.active=false;
    voice.media.pause();voice.media.removeEventListener('error',voice.failed);
    voice.media.removeEventListener('waiting',voice.waited);
    voice.media.removeEventListener('playing',voice.recovered);
    voice.media.removeEventListener('canplay',voice.recovered);
  }
  sync(force = false) {
    if(!this.timeline) return;
    for(const voice of this.voices) {
      const {event,media}=voice;
      const active=this.time>=event.at&&this.time<event.at+event.duration;
      if(!active) {
        if(voice.active||voice.pending) {voice.token++;voice.pending=false;media.pause();}
        voice.active=false;continue;
      }
      const elapsed=this.time-event.at+event.mediaOffset;
      const target=event.loop ? elapsed%event.assetDuration : elapsed;
      media.playbackRate=this.rate;
      media.volume=audioEventGain(event,this.time,this.timeline.audioEvents,this.timeline.ducking,this.timeline.masterVolume);
      if(force||!voice.active||media.ended||(!media.seeking&&!voice.pending&&Math.abs(media.currentTime-target)>.12)) {
        try {media.currentTime=target;} catch(error) {this.fail(new Error('Cannot seek audio: '+event.file));return;}
      }
      voice.active=true;
      if(!this.playing) {media.pause();continue;}
      if(media.paused&&!voice.pending) {
        const token=++voice.token;voice.pending=true;
        try {
          Promise.resolve(media.play()).then(()=>{
            if(token!==voice.token) {if(!this.playing||!voice.active) media.pause();return;}
            voice.pending=false;
            if(!this.playing||!voice.active) media.pause();
          },error=>{
            if(token!==voice.token) return;
            voice.pending=false;this.fail(new Error('Audio playback blocked or unavailable: '+event.file+' — '+error.message));
          });
        } catch(error) {voice.pending=false;this.fail(error);return;}
      }
    }
  }
  get buffering() {
    return this.playing&&this.voices.some(voice=>voice.active&&(voice.pending||voice.waiting||voice.media.seeking||voice.media.readyState<2));
  }
  play(time = this.time) {
    if(!this.timeline) throw new Error('AudioManager is not configured');
    if(!Number.isFinite(time)) throw new Error('Invalid audio play position');
    if(this.error) throw this.error;
    this.time=Math.max(0,Math.min(this.timeline.data.duration,time));
    this.playing=true;this.lastNow=this.now();this.sync(true);
  }
  pause() {
    this.playing=false;this.lastNow=null;
    for(const voice of this.voices) {voice.token++;voice.pending=false;voice.waiting=false;voice.media.pause();}
  }
  seek(time) {
    if(!Number.isFinite(time)) throw new Error('Invalid audio seek');
    for(const voice of this.voices) {voice.token++;voice.pending=false;voice.waiting=false;voice.media.pause();}
    this.time=Math.max(0,Math.min(this.timeline.data.duration,time));
    this.lastNow=this.now();this.sync(true);
  }
  restart() {this.seek(0);}
  setRate(rate) {
    if(!Number.isFinite(rate)||rate<=0||rate>4) throw new Error('Audio playback rate must be between 0 and 4');
    this.rate=rate;this.lastNow=this.now();this.sync(true);
    for(const voice of this.voices) voice.media.playbackRate=rate;
  }
  tick() {
    const now=this.now();
    if(this.playing) {
      if(this.buffering) {
        this.lastNow=now;
        for(const voice of this.voices) {
          if(voice.active&&!voice.pending&&!voice.waiting&&!voice.media.seeking&&voice.media.readyState>=2) voice.media.pause();
        }
        return this.time;
      }
      if(this.lastNow!==null) this.time=Math.min(this.timeline.data.duration,this.time+Math.max(0,now-this.lastNow)*this.rate);
      this.lastNow=now;this.sync();
      if(this.time>=this.timeline.data.duration) this.pause();
    }
    return this.time;
  }
  dispose() {
    this.pause();
    for(const voice of this.voices) this.releaseVoice(voice);
    for(const media of new Set([...this.probes.values(),...this.voices.map(voice=>voice.media)])) {
      media.pause();media.removeAttribute('src');media.load();
    }
    this.probes.clear();this.voices=[];this.durations={};this.timeline=null;
  }
}
