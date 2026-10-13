// A total, frame-derived order: never depend on the preceding DOM/seek state.
export function episodeEntityOrder(frame){
 const actors=Object.entries(frame.actors).map(([id,a])=>({id,kind:'actor',depth:a.groundY}));
 const props=Object.entries(frame.props).map(([id,p])=>{
  const contactDepth=(frame.handContacts??[]).filter(t=>t.prop===id).map(t=>frame.actors[t.id].groundY);
  const depth=p.owner?Math.max(frame.actors[p.owner].groundY,...contactDepth)+.1:p.depth??p.floorY;
  return {id,kind:'prop',depth,x:p.x,y:p.y};
 });
 return [...actors,...props].sort((a,b)=>a.depth-b.depth||
  (a.kind!==b.kind?(a.kind==='actor'?-1:1):a.kind==='prop'?b.y-a.y||a.x-b.x:0)||a.id.localeCompare(b.id));
}

// Props occlude the original hands. No detached palm is painted over the art.
export function createPropView(svg,definitions){
 const views=Object.fromEntries(Object.keys(definitions).map(id=>{
  const root=svg.querySelector(`[data-prop="${id}"]`);
  return [id,{root,art:root.querySelector('[data-prop-art]'),shadow:root.querySelector('[data-prop-shadow]')}];
 }));
 const entities=svg.querySelector('#episode-entities');
 const nodes=new Map([...entities.children].map(node=>[
  (node.hasAttribute('data-actor')?'actor:':'prop:')+(node.getAttribute('data-actor')??node.getAttribute('data-prop')),node
 ]));
 return frame=>{
  for(const {kind,id} of episodeEntityOrder(frame))entities.append(nodes.get(kind+':'+id));
  for(const [id,p] of Object.entries(frame.props)){
   const v=views[id];v.root.style.display=p.visible===false||(p.owner&&frame.actors[p.owner].visible===false)?'none':'';
   v.art.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.rotation}) scale(${p.scale}) translate(${-p.origin[0]} ${-p.origin[1]})`);
   const height=Math.max(0,p.floorY-p.y),size=Math.max(.45,1-height/500);
   v.shadow.style.display=p.owner?'none':'';
   v.shadow.setAttribute('transform',`translate(${p.x} ${p.floorY+2}) scale(${size} 1)`);
   v.shadow.setAttribute('opacity',String(.17*Math.max(.3,1-height/600)));
  }
 };
}
