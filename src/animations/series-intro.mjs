import {sampleWave} from './wave.mjs';
const introClamp=(n)=>Math.max(0,Math.min(1,n));
const introEase=n=>{const t=introClamp(n);return 1-Math.pow(1-t,3);};
export function sampleSeriesIntro(seconds,settings,rigs){
  if(!Number.isFinite(seconds)||settings.duration!==3)throw new Error('Series intro requires a finite time and three-second duration');
  const time=Math.max(0,Math.min(settings.duration,seconds));
  const ringProgress=introClamp(time/.55);
  const ringScale=ringProgress<1?introEase(ringProgress)*(1+.045*Math.sin(Math.PI*ringProgress)):1;
  const actors={};
  for(const [id,options]of Object.entries(settings.actors)){
    const progress=introClamp((time-options.enterAt)/options.enterDuration);
    const eased=introEase(progress);
    const bounce=progress===1?0:-18*Math.sin(Math.PI*progress)*eased;
    const waveTime=Math.max(0,Math.min(time-options.waveAt,rigs[id].motion.wave.raise+.38));
    actors[id]={...options,visible:progress>0,x:options.x,
      groundY:options.groundY+(1-eased)*410+bounce,scale:options.scale*(.82+.18*eased),
      opacity:introClamp(progress*4),pose:sampleWave(waveTime,rigs[id].motion.wave),
      mouth:null};
  }
  const titleSettings=settings.titleAnimation??{start:1.8,duration:.5,stagger:0};
  const titleLetters=Array.from({length:11},(_,index)=>{
    const progress=introClamp((time-titleSettings.start-index*titleSettings.stagger)/titleSettings.duration);
    const spring=progress===1?0:Math.sin(progress*Math.PI*3)*Math.exp(-4*progress);
    return {opacity:introClamp(progress*6),y:-65*(1-introEase(progress))-30*spring,scale:1+.18*spring};
  });
  return {time,ringScale,ringOpacity:introClamp(time/.18),actors,titleLetters,titleProgress:introEase((time-titleSettings.start)/.2)};
}
