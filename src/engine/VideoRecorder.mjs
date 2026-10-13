import {audioEventGain} from './AudioTimeline.mjs';

export const VIDEO_EXPORT={width:1920,height:1080,fps:60,videoBitrate:12000000,audioBitrate:384000,sampleRate:48000};

export function exportFramePlan(duration,fps=VIDEO_EXPORT.fps){
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(fps)||fps<1||fps>120)throw new Error('Invalid export frame timing');
  const frameCount=Math.ceil(duration*fps-1e-8);
  return {fps,frameCount,duration:frameCount/fps};
}

// Await every rendered and encoded frame. Slow machines take longer, without
// skipping animation samples or changing timestamps in the resulting file.
export async function encodeEpisodeFrames({duration,fps=VIDEO_EXPORT.fps,paint,addFrame,onProgress=()=>{},signal}){
  const plan=exportFramePlan(duration,fps);
  for(let index=0;index<plan.frameCount;index++){
    if(signal?.aborted)throw new Error('خروجی لغو شد.');
    await paint(index/fps);
    if(signal?.aborted)throw new Error('خروجی لغو شد.');
    await addFrame(index/fps,1/fps,index);
    onProgress((index+1)/plan.frameCount);
  }
  return plan;
}

export function exportGainCurve(event,events,ducking,masterVolume,fps=60){
  const length=Math.max(2,Math.ceil(event.duration*fps)+1);
  return Float32Array.from({length},(_,i)=>audioEventGain(event,event.at+event.duration*i/(length-1),events,ducking,masterVolume));
}

// This only mixes recordings supplied by the user. No speech or SFX synthesis.
export async function mixEpisodeAudio(episode,duration,baseURL,signal){
  const context=new OfflineAudioContext(2,Math.ceil(duration*VIDEO_EXPORT.sampleRate),VIDEO_EXPORT.sampleRate);
  const check=()=>{if(signal?.aborted)throw new Error('خروجی لغو شد.');};
  const events=episode.audioEvents??[];
  const buffers=new Map(await Promise.all([...new Set(events.map(e=>e.file))].map(async file=>{
    check();
    const response=await fetch(new URL(file.split('/').map(encodeURIComponent).join('/'),baseURL),{signal});
    if(!response.ok)throw new Error('Cannot load export audio: '+file);
    return [file,await context.decodeAudioData(await response.arrayBuffer())];
  })));
  check();
  for(const event of events){
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffers.get(event.file);source.loop=event.loop;
    source.connect(gain);gain.connect(context.destination);
    gain.gain.setValueCurveAtTime(exportGainCurve(event,events,episode.ducking,episode.masterVolume),event.at,event.duration);
    source.start(event.at,event.mediaOffset);source.stop(event.at+event.duration);
  }
  const mixed=await context.startRendering();check();return mixed;
}

let exportLibraries;
async function loadExportLibraries(baseURL){
  if(!exportLibraries)exportLibraries=(async()=>{
    const media=await import(new URL('vendor/mediabunny/mediabunny.mjs',baseURL).href);
    if(!(await media.canEncodeAudio('aac',{sampleRate:VIDEO_EXPORT.sampleRate,numberOfChannels:2,bitrate:VIDEO_EXPORT.audioBitrate}))){
      const aac=await import(new URL('vendor/mediabunny/aac-encoder.mjs',baseURL).href);
      aac.registerAacEncoder();
    }
    return media;
  })().catch(error=>{exportLibraries=null;throw error;});
  return exportLibraries;
}

export async function recordEpisode({svg,episode,render,baseURL=document.baseURI,onProgress=()=>{},signal}){
  if(!/^https?:$/.test(new URL(baseURL).protocol))throw new Error('برای خروجی، صفحه را از سرور استودیو باز کنید: http://127.0.0.1:4173');
  if(typeof VideoEncoder==='undefined'||typeof OfflineAudioContext==='undefined')throw new Error('برای خروجی MP4 از نسخهٔ جدید Chrome یا Edge استفاده کنید.');
  const check=()=>{if(signal?.aborted)throw new Error('خروجی لغو شد.');};
  const plan=exportFramePlan(episode.data.duration);
  const media=await loadExportLibraries(baseURL);check();
  const videoConfig={codec:'avc',fullCodecString:'avc1.64002a',bitrate:VIDEO_EXPORT.videoBitrate,latencyMode:'quality',bitrateMode:'variable',keyFrameInterval:.5,hardwareAcceleration:'prefer-hardware'};
  if(!(await media.canEncodeVideo('avc',{...videoConfig,width:VIDEO_EXPORT.width,height:VIDEO_EXPORT.height})))videoConfig.hardwareAcceleration='prefer-software';
  if(!(await media.canEncodeVideo('avc',{...videoConfig,width:VIDEO_EXPORT.width,height:VIDEO_EXPORT.height})))throw new Error('این مرورگر کدگذاری H.264 را پشتیبانی نمی‌کند؛ نسخهٔ جدید Chrome یا Edge را امتحان کنید.');
  const canvas=document.createElement('canvas');canvas.width=VIDEO_EXPORT.width;canvas.height=VIDEO_EXPORT.height;
  const drawing=canvas.getContext('2d',{alpha:false});
  const output=new media.Output({format:new media.Mp4OutputFormat({fastStart:'in-memory'}),target:new media.BufferTarget()});
  const videoSource=new media.CanvasSource(canvas,videoConfig);
  const audioSource=new media.AudioBufferSource({codec:'aac',bitrate:VIDEO_EXPORT.audioBitrate});
  output.addVideoTrack(videoSource,{frameRate:plan.fps});output.addAudioTrack(audioSource);
  let audioJob,audioError,finished=false;
  try{
    const mixed=await mixEpisodeAudio(episode,plan.duration,baseURL,signal);check();
    await output.start();
    // Audio and video are submitted together to respect muxer backpressure.
    audioJob=audioSource.add(mixed).catch(error=>{audioError=error;});
    await encodeEpisodeFrames({duration:episode.data.duration,signal,
      paint:async time=>{
        check();if(audioError)throw audioError;render(time);
        const clone=svg.cloneNode(true);clone.setAttribute('width',String(VIDEO_EXPORT.width));clone.setAttribute('height',String(VIDEO_EXPORT.height));
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
        try{const picture=new Image();picture.src=url;await picture.decode();check();drawing.drawImage(picture,0,0,canvas.width,canvas.height);}
        finally{URL.revokeObjectURL(url);}
      },
      addFrame:(time,duration)=>videoSource.add(time,duration),
      onProgress:progress=>onProgress(progress*.98)
    });
    await audioJob;if(audioError)throw audioError;check();
    await output.finalize();check();finished=true;
    const blob=new Blob([output.target.buffer],{type:'video/mp4'});
    if(!blob.size)throw new Error('The browser produced an empty MP4');
    onProgress(1);
    return {blob,extension:'mp4',mime:'video/mp4',fps:plan.fps,frameCount:plan.frameCount,duration:plan.duration};
  }finally{
    if(!finished)await output.cancel().catch(()=>{});
    if(audioJob)await audioJob;
  }
}
