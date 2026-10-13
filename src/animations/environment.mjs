const environmentFinite = (value, name, min = 0) => {
  if (!Number.isFinite(value) || value < min) throw new Error('Invalid environment ' + name);
};
export function sampleCloud(time, {x, width, speed = 12, sceneWidth = 1920}) {
  environmentFinite(time,'time'); environmentFinite(width,'width',Number.MIN_VALUE);
  environmentFinite(x,'x',-width); environmentFinite(speed,'speed');
  environmentFinite(sceneWidth,'scene width',Number.MIN_VALUE);
  if (x>sceneWidth) throw new Error('Cloud starts outside wrapping interval');
  const span=sceneWidth+width;
  return ((x+width-speed*time)%span+span)%span-width;
}
export function sampleSunRays(time, {period=3,minLength=12,maxLength=30}={}) {
  environmentFinite(time,'time'); environmentFinite(period,'period',Number.MIN_VALUE);
  environmentFinite(minLength,'ray length'); environmentFinite(maxLength,'ray length',minLength);
  return minLength+(maxLength-minLength)*(.5-.5*Math.cos(time/period*2*Math.PI));
}
export function createEnvironmentMotion(root, config={}, sceneWidth=1920) {
  const instance=id=>{
    if (typeof id!=='string'||!/^[a-z][a-z0-9-]*$/i.test(id)) throw new Error('Invalid environment instance');
    const element=root.querySelector('[data-instance="'+id+'"]');
    if (!element) throw new Error('Missing environment instance: '+id);
    return element;
  };
  const clouds=(config.clouds??[]).map(options=>{
    sampleCloud(0,{...options,sceneWidth});
    environmentFinite(options.y,'cloud y');
    const element=instance(options.instance);
    return {options,element,initial:element.getAttribute('transform')};
  });
  const sun=config.sun?instance(config.sun.instance):null;
  if(sun) sampleSunRays(0,config.sun);
  const rays=sun?[...sun.querySelectorAll('[data-sun-ray]')].map(line=>({
    line,x:Number(line.getAttribute('x1')),y:Number(line.getAttribute('y1')),angle:Number(line.getAttribute('data-angle'))
  })):[];
  if(sun&&rays.length!==8) throw new Error('Sun requires eight marked rays');
  return time=>{
    for(const {options,element,initial} of clouds) element.setAttribute('transform',initial.replace(/^translate\([^)]*\)/,'translate('+sampleCloud(time,{...options,sceneWidth})+' '+options.y+')'));
    if(sun) for(const {line,x,y,angle} of rays) {
      const length=sampleSunRays(time,config.sun);
      line.setAttribute('x2',x+Math.cos(angle)*length);line.setAttribute('y2',y+Math.sin(angle)*length);
    }
  };
}
