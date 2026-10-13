import {getCharacterParts,applyCharacterPose} from './CharacterMotion.mjs';
export function createSeriesIntroView(layer,settings,rigs){
 const actors=Object.fromEntries(Object.keys(settings.actors).map(id=>{
  const root=layer.querySelector('[data-intro-actor="'+id+'"]'),svg=root.querySelector('.character-art');
  return[id,{root,svg,facing:root.querySelector('[data-facing]'),parts:getCharacterParts(svg,rigs[id])}];
 }));
 return frame=>{
  const center=settings.ring.center,ring=layer.querySelector('[data-intro-ring]');
  ring.setAttribute('transform','translate('+center.join(' ')+') scale('+(frame.ringScale*settings.ring.stretch[0])+' '+(frame.ringScale*settings.ring.stretch[1])+') translate('+center.map(n=>-n).join(' ')+')');ring.style.opacity=frame.ringOpacity;
  for(const [id,actor]of Object.entries(frame.actors)){
   const view=actors[id];view.root.style.display=actor.visible?'':'none';view.root.style.opacity=actor.opacity;
   view.root.setAttribute('transform','translate('+actor.x+' '+actor.groundY+') scale('+actor.scale+') translate(-200 -480)');
   view.facing.setAttribute('transform',actor.facing==='left'?'translate(400 0) scale(-1 1)':'');
   view.svg.dataset.expression=actor.expression;view.svg.dataset.mouth='auto';view.svg.dataset.speaking='false';
   applyCharacterPose(view.svg,rigs[id],view.parts,actor.pose);
  }
  const title=layer.querySelector('[data-intro-title]');title.style.opacity=frame.titleProgress;
  title.querySelectorAll('[data-title-letter]').forEach(letter=>{const pose=frame.titleLetters[Number(letter.dataset.titleLetter)];letter.style.opacity=pose.opacity;letter.setAttribute('transform','translate(0 '+pose.y+') translate(0 100) scale('+pose.scale+') translate(0 -100)');});
 };
}
