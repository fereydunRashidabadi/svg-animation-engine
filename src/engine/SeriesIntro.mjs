import {compileAudioTimeline} from './AudioTimeline.mjs';
export function setSeriesIntroAudio(intro,enabled=true){
 if(typeof enabled!=='boolean')throw new Error('Invalid introAudio flag');
 if(enabled)return intro;
 return {...structuredClone(intro),audio:{manifest:{},events:[]}};
}
// Prefix a resolved story once; all story cues, chapters and audio shift together.
export function prependSeriesIntro(story,intro,durations){
 if(!intro)return story;
 if(intro.duration!==3)throw new Error('Series intro must last three seconds');
 const source=structuredClone(intro);
 const hey=source.audio?.events.find(event=>event.id==='group-hey');
 if(hey){const file=typeof source.audio.manifest[hey.asset]==='string'?source.audio.manifest[hey.asset]:source.audio.manifest[hey.asset]?.file;hey.at=3-durations[file];}
 const lead=compileAudioTimeline(source,durations),offset=intro.duration;
 const shifted=story.events.map(event=>({...event,at:event.at+offset}));
 const ids=new Set();
 for(const event of [...lead.events,...shifted]){if(ids.has(event.id))throw new Error('Intro/story audio ID conflict: '+event.id);ids.add(event.id);}
 return {...story,data:{...story.data,duration:story.data.duration+offset,introDuration:offset,cues:story.data.cues.map(cue=>({...cue,at:cue.at+offset})),chapters:[{start:0,title:intro.title??'Intro',label:'Intro'},...story.data.chapters.map(chapter=>({...chapter,start:chapter.start+offset}))]},events:[...lead.events,...shifted],blocks:[{id:'series-intro',start:0,end:offset,duration:offset},...story.blocks.map(block=>({...block,start:block.start+offset,end:block.end+offset}))]};
}
