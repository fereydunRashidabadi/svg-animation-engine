// World units, seconds and degrees. All sampling is independent of wall-clock time.
export const propClamp=n=>Math.max(0,Math.min(1,n));
export const propSmooth=n=>{const p=propClamp(n);return p*p*(3-2*p);};
export function propPoint(value,label){
 if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite))throw new Error('Invalid '+label+' point');
 return [...value];
}
export function propGripWorld(prop){
 const a=prop.rotation*Math.PI/180,dx=(prop.grip[0]-prop.origin[0])*prop.scale,dy=(prop.grip[1]-prop.origin[1])*prop.scale;
 return [prop.x+dx*Math.cos(a)-dy*Math.sin(a),prop.y+dx*Math.sin(a)+dy*Math.cos(a)];
}
export function propAtGrip(prop,point,rotation=prop.rotation){
 const relative=propGripWorld({...prop,x:0,y:0,rotation});
 return {...prop,x:point[0]-relative[0],y:point[1]-relative[1],rotation};
}
export function propSupport(prop,rotation=prop.rotation){
 const a=rotation*Math.PI/180;
 return Math.max(...prop.hull.map(([x,y])=>((x-prop.origin[0])*Math.sin(a)+(y-prop.origin[1])*Math.cos(a))*prop.scale));
}
export function samplePropMove(seconds,{from,to,duration,arc=0}){
 const p=propSmooth(seconds/duration);
 return {...from,x:from.x+(to.x-from.x)*p,y:from.y+(to.y-from.y)*p-arc*Math.sin(Math.PI*p),rotation:from.rotation+(to.rotation-from.rotation)*p};
}
export function samplePropWobble(seconds,{from,duration,angle=6,cycles=3}){
 const p=propClamp(seconds/duration);
 const rotation=from.rotation+Math.sin(p*Math.PI*2*cycles)*Math.sin(p*Math.PI)*angle;
 // Keep the lowest silhouette point on the support surface while rocking.
 return {...from,rotation,y:from.y+propSupport(from)-propSupport(from,rotation)};
}
export function compilePropFall(from,{duration,gravity=1400,vx=0,vy=0,angularVelocity=70,restitution=.2,friction=.55,settle=.4,floorY=from.floorY,restAngles=from.restAngles??[0]}){
 for(const [key,value] of Object.entries({duration,gravity,vx,vy,angularVelocity,restitution,friction,settle,floorY}))if(!Number.isFinite(value))throw new Error('Invalid fall '+key);
 if(duration<=settle||settle<=0||gravity<=0||restitution<0||restitution>.6||friction<0||friction>1)throw new Error('Invalid fall physics/timing');
 if(!Array.isArray(restAngles)||!restAngles.length||!restAngles.every(Number.isFinite))throw new Error('Invalid rest angles');
 const hz=120,dt=1/hz,frames=[];
 let p={...from},vertical=vy,horizontal=vx,spin=angularVelocity,hit=false;
 const landing=floorY-propSupport(p);
 if(p.y>landing+1e-6)throw new Error('Fall starts below its floor');
 const settleAt=duration-settle;
 const steps=Math.ceil(settleAt*hz);
 for(let i=0;i<=steps;i++){
  const t=Math.min(i*dt,settleAt);
  if(i){const step=t-frames.at(-1).time;vertical+=gravity*step;p.x+=horizontal*step;p.y+=vertical*step;p.rotation+=spin*step;
   const supportY=floorY-propSupport(p);
   if(p.y>=supportY){p.y=supportY;hit=true;vertical=Math.abs(vertical)<65?0:-Math.abs(vertical)*restitution;horizontal*=friction;spin*=.45;}
  }
  frames.push({time:t,x:p.x,y:p.y,rotation:p.rotation});
 }
 if(!hit||Math.abs(vertical)>85||p.y<floorY-propSupport(p)-4)throw new Error('Fall duration too short to land and settle');
 const turn=p.rotation/360;
 const candidates=restAngles.flatMap(a=>[-1,0,1].map(d=>a+360*(Math.round(turn-a/360)+d)));
 const finalRotation=candidates.reduce((a,b)=>Math.abs(a-p.rotation)<=Math.abs(b-p.rotation)?a:b);
 const end={...from,floorY,x:p.x+horizontal*settle*.25,y:floorY-propSupport(from,finalRotation),rotation:finalRotation};
 return {from,frames,duration,settle,settleAt,floorY,end};
}
export function samplePropFall(seconds,fall){
 const t=Math.max(0,Math.min(fall.duration,seconds));
 if(t>=fall.duration)return {...fall.end};
 if(t>=fall.settleAt){const start=fall.frames.at(-1),p=propSmooth((t-fall.settleAt)/fall.settle),rotation=start.rotation+(fall.end.rotation-start.rotation)*p;
  const gap=fall.floorY-propSupport(fall.from,start.rotation)-start.y;
  return {...fall.from,floorY:fall.floorY,x:start.x+(fall.end.x-start.x)*p,y:fall.floorY-propSupport(fall.from,rotation)-gap*(1-p),rotation};
 }
 const index=Math.min(Math.floor(t*120),fall.frames.length-2),a=fall.frames[index],b=fall.frames[index+1],p=(t-a.time)/(b.time-a.time);
 const rotation=a.rotation+(b.rotation-a.rotation)*p;
 return {...fall.from,floorY:fall.floorY,x:a.x+(b.x-a.x)*p,y:Math.min(a.y+(b.y-a.y)*p,fall.floorY-propSupport(fall.from,rotation)),rotation};
}

export function actorPointWorld(actor,point){
 const sign=actor.facing==='left'?-1:1;
 return [actor.x+sign*(point[0]-200)*actor.scale,actor.groundY+(point[1]-480)*actor.scale];
}
export function actorBodyPointWorld(actor,rig,point){
 const p=actor.pose,a=p.lean*Math.PI/180,[cx,cy]=p.bodyPivot??[rig.groundAnchor[0],425];
 return actorPointWorld(actor,[cx+(point[0]-cx)*Math.cos(a)-(point[1]-cy)*Math.sin(a)+p.sway,cy+(point[0]-cx)*Math.sin(a)+(point[1]-cy)*Math.cos(a)+p.bob]);
}
export function actorHandWorld(actor,rig,hand='far'){
 const geometry=rig.interaction?.hands?.[hand];
 if(!geometry)throw new Error('Missing '+hand+' hand metadata');
 const pose=actor.pose,angle=(pose.lean??0)*Math.PI/180;
 const [x,y]=geometry.anchor,pivot=rig.joints[geometry.part].pivot;
 const arm=(hand==='near'?(pose.armLeft??-pose.arm):(pose.armRight??pose.arm))*Math.PI/180;
 const matrix=pose.handTransforms?.[hand];
 const rx=matrix?matrix[0]*x+matrix[2]*y+matrix[4]:pivot[0]+(x-pivot[0])*Math.cos(arm)-(y-pivot[1])*Math.sin(arm),ry=matrix?matrix[1]*x+matrix[3]*y+matrix[5]:pivot[1]+(x-pivot[0])*Math.sin(arm)+(y-pivot[1])*Math.cos(arm);
 const [cx,cy]=pose.bodyPivot??[rig.groundAnchor[0],425];
 return actorPointWorld(actor,[cx+(rx-cx)*Math.cos(angle)-(ry-cy)*Math.sin(angle)+(pose.sway??0),cy+(rx-cx)*Math.sin(angle)+(ry-cy)*Math.cos(angle)+(pose.bob??0)]);
}
export function reachPropPose(actor,rig,hand,target,{bend=0,lean=0,sway=0}={}){
 const geometry=rig.interaction?.hands?.[hand];
 if(!geometry)throw new Error('Missing '+hand+' hand metadata');
 const base=actor.pose,pose={...base,bodyPivot:rig.interaction.bodyPivot??[rig.groundAnchor[0],425],bob:base.bob+bend,lean:base.lean+lean,sway:base.sway+sway,feet:base.feet.map(f=>({...f,x:f.x-sway,y:f.y-bend}))};
 const sign=actor.facing==='left'?-1:1;
 const q=[200+sign*(target[0]-actor.x)/actor.scale-pose.sway,480+(target[1]-actor.groundY)/actor.scale-pose.bob];
 const a=-pose.lean*Math.PI/180,[cx,cy]=pose.bodyPivot;
 const local=[cx+(q[0]-cx)*Math.cos(a)-(q[1]-cy)*Math.sin(a),cy+(q[0]-cx)*Math.sin(a)+(q[1]-cy)*Math.cos(a)];
 const pivot=rig.joints[geometry.part].pivot,u=[geometry.anchor[0]-pivot[0],geometry.anchor[1]-pivot[1]],v=[local[0]-pivot[0],local[1]-pivot[1]];
 const length=Math.hypot(...u),reach=Math.hypot(...v),scale=reach/length;
 if(scale>(rig.interaction.maxReachScale??1.5)+1e-6)throw new Error('Object out of '+hand+' hand reach; move the actor closer');
 // Rotate the original arm and stretch only its length, keeping its thickness.
 const ua=Math.atan2(u[1],u[0]),va=Math.atan2(v[1],v[0]),cu=Math.cos(ua),su=Math.sin(ua),cv=Math.cos(va),sv=Math.sin(va);
 const m=[cv*scale*cu+sv*su,sv*scale*cu-cv*su,cv*scale*su-sv*cu,sv*scale*su+cv*cu];
 pose.handTransforms={...(base.handTransforms??{}),[hand]:[...m,pivot[0]-m[0]*pivot[0]-m[2]*pivot[1],pivot[1]-m[1]*pivot[0]-m[3]*pivot[1]]};
 return pose;
}
