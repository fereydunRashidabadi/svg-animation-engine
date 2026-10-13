const expressiveClamp=n=>Math.max(0,Math.min(1,n));
const expressiveSmooth=n=>{const p=expressiveClamp(n);return p*p*(3-2*p);};
const expressiveNeutral=()=>({position:0,bob:0,sway:0,lean:0,head:0,arm:0,armLeft:0,armRight:0,tail:0,earLeft:0,earRight:0,gaze:{x:0,y:0},feet:[{x:0,y:0},{x:0,y:0}]});
function expressiveTime(seconds,duration){if(!Number.isFinite(seconds)||!Number.isFinite(duration)||duration<=0)throw new Error('Invalid expressive motion timing');return expressiveClamp(seconds/duration);}
function expressiveGate(p){return expressiveSmooth(p/.28)*expressiveSmooth((1-p)/.25);}
export function samplePeek(seconds,{duration=1.8,direction='right',mirrored=false,amount=1}={}){
 const p=expressiveTime(seconds,duration),gate=expressiveGate(p);
 if(!['left','right'].includes(direction)||!Number.isFinite(amount)||amount<0||amount>2)throw new Error('Invalid peek direction/amount');
 const sign=(direction==='left'?-1:1)*(mirrored?-1:1),energy=gate*amount;
 return {...expressiveNeutral(),lean:-12*energy*sign,sway:16*energy*sign,bob:-3*energy,head:5*energy*sign,armLeft:10*energy,armRight:-8*energy,tail:-6*energy*sign,earLeft:3*energy*sign,earRight:2*energy*sign,gaze:{x:6*gate*sign,y:3*gate},feet:[{x:-16*energy*sign,y:3*energy},{x:-16*energy*sign,y:3*energy}]};
}
export function sampleShrug(seconds,{duration=1.5}={}){
 const p=expressiveTime(seconds,duration),gate=expressiveGate(p);
 return {...expressiveNeutral(),bob:-4*gate,head:-4*gate,armLeft:65*gate,armRight:-55*gate,tail:4*gate,earLeft:-3*gate,earRight:3*gate,feet:[{x:0,y:4*gate},{x:0,y:4*gate}]};
}
export function sampleHappyHop(seconds,{duration=1.4,height=24}={}){
 const p=expressiveTime(seconds,duration);
 if(!Number.isFinite(height)||height<=0||height>60)throw new Error('Invalid hop height');
 const preparation=p<.2?Math.sin(Math.PI*p/.2):0;
 const flight=p>=.2&&p<.72?Math.sin(Math.PI*(p-.2)/.52):0;
 const landing=p>=.72?Math.sin(Math.PI*(p-.72)/.28):0;
 if(p===0||p===1)return expressiveNeutral();
 const lift=-height*flight,compression=5*(preparation+landing);
 return {...expressiveNeutral(),bob:lift+compression,head:-3*flight,armLeft:35*flight,armRight:-25*flight,tail:8*flight,earLeft:-5*flight+3*landing,earRight:5*flight-3*landing,feet:[{x:0,y:-compression},{x:0,y:-compression}]};
}
