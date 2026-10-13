import {propPoint,propSmooth,propGripWorld,propAtGrip,samplePropMove,samplePropWobble,compilePropFall,samplePropFall,actorHandWorld,actorBodyPointWorld,reachPropPose} from '../animations/prop-motion.mjs';

export const PROP_CUES=new Set(['pickUp','place','handOver','moveProp','wobble','fall']);
const propLerp=(a,b,p)=>a.map((v,i)=>v+(b[i]-v)*p);
function validateProp(id,p){
 if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id))throw new Error('Invalid prop ID');
 if(!p||typeof p!=='object'||typeof p.asset!=='string'||!p.asset)throw new Error('Invalid prop '+id);
 for(const key of ['x','y','scale','rotation','floorY'])if(!Number.isFinite(p[key]))throw new Error('Invalid prop '+key+': '+id);
 if(p.scale<=0)throw new Error('Invalid prop scale');
 if(p.visible!==undefined&&typeof p.visible!=='boolean')throw new Error('Invalid prop visibility');
 if(p.depth!==undefined&&!Number.isFinite(p.depth))throw new Error('Invalid prop depth');
 propPoint(p.origin,'origin');propPoint(p.grip,'grip');
 if(p.carryPoint!==undefined)propPoint(p.carryPoint,'carry');
 if(!Array.isArray(p.hull)||p.hull.length<3)throw new Error('Missing prop contact hull');
 p.hull.forEach(point=>propPoint(point,'hull'));
}
const carryPoint=(actor,rig,hand,prop)=>actorBodyPointWorld(actor,rig,prop.carryPoint??rig.interaction.hands[hand].carry);

function evaluatePropCue(cue,time,actorFrame,rigs){
 const elapsed=time-cue.at,p=Math.max(0,Math.min(1,elapsed/cue.duration)),from=cue.from;
 const actors=actorFrame.actors;
 const targets=[];
 const add=(id,hand,target,bend=0,lean=0,sway=0)=>targets.push({id,hand,target,bend,lean,sway});
 if(cue.type==='moveProp')return {prop:samplePropMove(elapsed,{from,to:cue.to,duration:cue.duration,arc:cue.arc}),targets};
 if(cue.type==='wobble')return {prop:samplePropWobble(elapsed,{...cue,from}),targets};
 if(cue.type==='fall')return {prop:samplePropFall(elapsed,cue.fall),targets};
 const actor=actors[cue.actor],rig=rigs[cue.actor],hand=cue.hand;
 const rest=actorHandWorld(actor,rig,hand),carry=carryPoint(actor,rig,hand,from);
 const gate=propSmooth(p/.4)*propSmooth((1-p)/.45);
 if(cue.type==='pickUp'){
  const initial=propGripWorld(from),contact=cue.contact;
  const target=p<contact?propLerp(rest,initial,propSmooth(p/contact)):propLerp(initial,carry,propSmooth((p-contact)/(1-contact)));
  if(p<1)add(cue.actor,hand,target,cue.bend*gate,cue.lean*gate);
  return {prop:p<contact?{...from}: {...propAtGrip(from,target),owner:cue.actor,hand},targets};
 }
 if(cue.type==='place'){
  const destination=propGripWorld(cue.to),release=cue.release;
  const target=p<release?propLerp(carry,destination,propSmooth(p/release)):propLerp(destination,rest,propSmooth((p-release)/(1-release)));
  if(p<1)add(cue.actor,hand,target,cue.bend*gate,cue.lean*gate);
  const prop=p<release?{...propAtGrip(from,target,from.rotation+(cue.to.rotation-from.rotation)*propSmooth(p/release)),owner:cue.actor,hand}: {...cue.to,owner:null,hand:null};
  return {prop,targets};
 }
 const receiver=actors[cue.toActor],toRig=rigs[cue.toActor],toHand=cue.toHand;
 const receiveCarry=carryPoint(receiver,toRig,toHand,from),receiveRest=actorHandWorld(receiver,toRig,toHand);
 const point=cue.point??propLerp(carry,receiveCarry,.5),exchange=cue.exchange;
 const transfer=propAtGrip(from,point),receiving={...transfer,grip:cue.toGrip??from.grip};
 const receiveContact=propGripWorld(receiving);
 const grip=p<exchange?propLerp(carry,point,propSmooth(p/exchange)):propLerp(receiveContact,receiveCarry,propSmooth((p-exchange)/(1-exchange)));
 if(p<1){
  add(cue.actor,hand,p<exchange?grip:propLerp(point,rest,propSmooth((p-exchange)/(1-exchange))));
  add(cue.toActor,toHand,p<exchange?propLerp(receiveRest,receiveContact,propSmooth(p/exchange)):grip);
 }
 return {prop:{...propAtGrip(p<exchange?from:receiving,grip),owner:p<exchange?cue.actor:cue.toActor,hand:p<exchange?hand:toHand},targets};
}

export function samplePropTimeline(timeline,time,actorFrame,{applyPose=true}={}){
 const props=Object.fromEntries(Object.entries(timeline.initial).map(([id,p])=>[id,{...p,owner:null,hand:null}]));
 const targets=[];
 for(const cue of timeline.cues){
  if(cue.at>time)break;
  const state=evaluatePropCue(cue,Math.min(time,cue.at+cue.duration),actorFrame,timeline.rigs);
  props[cue.prop]=state.prop;
  if(time<cue.at+cue.duration)targets.push(...state.targets.map(t=>({...t,prop:cue.prop})));
 }
 // After pickup/handover the object stays attached, including while toddling.
 for(const [id,p] of Object.entries(props))if(p.owner&&!targets.some(t=>t.prop===id)){
  const actor=actorFrame.actors[p.owner],target=carryPoint(actor,timeline.rigs[p.owner],p.hand,p);
  props[id]=propAtGrip(p,target);targets.push({id:p.owner,hand:p.hand,target,bend:0,lean:0,sway:0,prop:id});
 }
 if(applyPose)for(const t of targets){const actor=actorFrame.actors[t.id];actor.pose=reachPropPose(actor,timeline.rigs[t.id],t.hand,t.target,t);}
 return {props,targets};
}

export function compilePropTimeline(data,cues,rigs,actorSampler){
 if(data.props!==undefined&&(!data.props||typeof data.props!=='object'||Array.isArray(data.props)))throw new Error('Props must be an object map');
 const initial=Object.fromEntries(Object.entries(data.props??{}).map(([id,p])=>[id,{scale:1,rotation:0,visible:true,...p}]));
 for(const [id,p] of Object.entries(initial))validateProp(id,p);
 const timeline={initial,cues:[],rigs},ends=new Map(),hands=new Map(),reservations=[];
 const handKey=(actor,hand)=>actor+':'+hand;
 const fraction=(value,label)=>{if(!Number.isFinite(value)||value<=0||value>=1)throw new Error('Invalid '+label+' fraction');return value;};
 for(const raw of cues.filter(c=>PROP_CUES.has(c.type))){
  if(!Object.hasOwn(initial,raw.prop))throw new Error('Unknown prop: '+raw.prop);
  if((ends.get(raw.prop)??0)>raw.at+1e-8)throw new Error('Overlapping prop cues: '+raw.prop);
  const prior=samplePropTimeline(timeline,raw.at,actorSampler(raw.at),{applyPose:false}).props[raw.prop];
  const cue={...raw,from:{...prior}};
  const end=cue.at+cue.duration;ends.set(cue.prop,end);
  if(['pickUp','place','handOver'].includes(cue.type)){
   cue.hand=cue.hand??(cue.type==='pickUp'?'far':prior.hand??'far');
   if(!rigs[cue.actor]?.interaction?.hands?.[cue.hand])throw new Error('Unknown actor/hand');
   const actor=data.actors[cue.actor];
   if(!actor||!Number.isFinite(actor.scale)||actor.scale<=0||![actor.x,actor.groundY].every(Number.isFinite))throw new Error('Invalid interacting actor');
   reservations.push({actor:cue.actor,start:cue.at,end});
  }
  if(cue.type==='pickUp'){
   if(prior.owner)throw new Error('Cannot pick up an owned prop');
   if(hands.has(handKey(cue.actor,cue.hand)))throw new Error('Hand already holds a prop');
   cue.contact=fraction(cue.contact??.4,'contact');cue.bend=cue.bend??25;
   hands.set(handKey(cue.actor,cue.hand),cue.prop);
  }else if(cue.type==='place'||cue.type==='handOver'){
   if(prior.owner!==cue.actor||prior.hand!==cue.hand)throw new Error('Actor does not hold this prop in that hand');
   hands.delete(handKey(cue.actor,cue.hand));
   if(cue.type==='place'){
    const point=propPoint(cue.to,'placement');
    cue.to={...prior,x:point[0],y:point[1],rotation:cue.rotation??prior.rotation,owner:null,hand:null};
    if(!Number.isFinite(cue.to.rotation))throw new Error('Invalid placement rotation');
    cue.release=fraction(cue.release??.65,'release');cue.bend=cue.bend??22;
   }else{
    cue.toHand=cue.toHand??'far';
    if(cue.toActor===cue.actor||!rigs[cue.toActor]?.interaction?.hands?.[cue.toHand])throw new Error('Invalid receiving actor/hand');
    if(hands.has(handKey(cue.toActor,cue.toHand)))throw new Error('Receiving hand already holds a prop');
    if(cue.point)cue.point=propPoint(cue.point,'handover');
    if(cue.toGrip)cue.toGrip=propPoint(cue.toGrip,'receiving grip');
    cue.exchange=fraction(cue.exchange??.5,'exchange');hands.set(handKey(cue.toActor,cue.toHand),cue.prop);
    reservations.push({actor:cue.toActor,start:cue.at,end});
   }
  }else{
   if(prior.owner)throw new Error('Cannot move/fall an owned prop; place it first');
   if(cue.type==='moveProp'){
    if((cue.to!==undefined)===(cue.delta!==undefined))throw new Error('Use exactly one prop destination or displacement');
    const point=propPoint(cue.to??cue.delta,'travel');
    cue.to={...prior,x:cue.to?point[0]:prior.x+point[0],y:cue.to?point[1]:prior.y+point[1],rotation:cue.rotation??prior.rotation};
    cue.arc=cue.arc??0;if(!Number.isFinite(cue.arc)||cue.arc<0||!Number.isFinite(cue.to.rotation))throw new Error('Invalid prop movement');
   }else if(cue.type==='fall')cue.fall=compilePropFall(prior,cue);
   else{cue.angle=cue.angle??6;cue.cycles=cue.cycles??3;if(!Number.isFinite(cue.angle)||cue.angle<0||cue.angle>25||!Number.isInteger(cue.cycles)||cue.cycles<1)throw new Error('Invalid prop wobble');}
  }
  if(cue.bend!==undefined&&(!Number.isFinite(cue.bend)||cue.bend<0||cue.bend>35))throw new Error('Invalid pickup/place bend');
  if(cue.type==='pickUp'||cue.type==='place'){
   cue.lean=cue.lean??(cue.bend>0?18:7);
   if(!Number.isFinite(cue.lean)||cue.lean<0||cue.lean>30)throw new Error('Invalid pickup/place lean');
  }
  timeline.cues.push(cue);
  // Fail at authoring time instead of stretching an arm across the room.
  if(['pickUp','place','handOver'].includes(cue.type))for(let i=0;i<=24;i++){
   const time=cue.at+cue.duration*i/24;
   try{samplePropTimeline(timeline,time,actorSampler(time));}
   catch(error){throw new Error(`${cue.type} ${cue.prop} (${cue.actor}, ${time.toFixed(2)}s): ${error.message}`,{cause:error});}
  }
 }
 const bodyTypes=new Set(['toddle','wave','kick','peek','shrug','happyHop']);
 for(let i=0;i<reservations.length;i++){
  const r=reservations[i];
  for(const s of reservations.slice(i+1))if(r.actor===s.actor&&r.start<s.end-1e-8&&s.start<r.end-1e-8)throw new Error('Overlapping actor interactions');
  for(const c of cues)if(c.actor===r.actor&&bodyTypes.has(c.type)&&c.at<r.end-1e-8&&r.start<c.at+c.duration-1e-8)throw new Error('Body action conflicts with object interaction');
  for(const c of cues)if(c.type==='set'&&c.actor===r.actor&&c.at>=r.start&&c.at<r.end&&c.facing!==undefined)throw new Error('Facing change during object interaction');
 }
 for(const c of cues.filter(c=>['wave','shrug'].includes(c.type))){
  const p=samplePropTimeline(timeline,c.at,actorSampler(c.at),{applyPose:false}).props;
  if(Object.values(p).some(p=>p.owner===c.actor&&(c.type==='shrug'||p.hand==='near')))throw new Error('Gesture uses a hand holding a prop');
 }
 return timeline;
}
