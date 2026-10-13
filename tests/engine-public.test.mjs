import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEpisode,sampleEpisode} from '../src/engine/EpisodeTimeline.mjs';
import {exportFramePlan} from '../src/engine/VideoRecorder.mjs';
import {readdir} from 'node:fs/promises';
test('modules load without private content',async()=>{
 for(const folder of ['engine','animations'])
  for(const file of await readdir(new URL('../src/'+folder+'/',import.meta.url)))
   if(file.endsWith('.mjs')) await import('../src/'+folder+'/'+file);
});
test('custom actor reconstructs after backward seeking',()=>{
 const rigs={hero:{motion:{wave:{duration:2,raise:.4,lower:.4,raiseAngle:90,wiggleAngle:8,bodyLift:2,headTilt:2,tailSwing:0,earSway:0}}}};
 const source={title:'My Story',duration:4,viewBox:[0,0,1920,1080],actors:{hero:{x:600,groundY:900,scale:1,facing:'right',expression:'normal',visible:true}},cues:[{type:'wave',actor:'hero',at:1,duration:2}],chapters:[]};
 const episode=compileEpisode(source,rigs);
 const first=sampleEpisode(episode,1.5);
 sampleEpisode(episode,4);
 assert.deepEqual(sampleEpisode(episode,1.5),first);
 assert.ok(first.actors.hero.pose.armLeft>0);
 assert.equal(sampleEpisode(episode,4).actors.hero.pose.armLeft,0);
});
test('export uses a fixed frame grid',()=>{
 assert.deepEqual(exportFramePlan(1,60),{fps:60,frameCount:60,duration:1});
});
