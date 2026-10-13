// Character-specific geometry comes entirely from character.json.
export function getCharacterParts(svg, rig) {
  return Object.fromEntries(Object.entries(rig.parts).map(([key,id]) => [key, svg.querySelector(`[id="${id}"], [id$="-${id}"]`)]));
}

// Shared renderer for the movement studio and SVG episode frames.
export function applyCharacterPose(svg, rig, parts, pose) {
  const rotate = (key, angle) => {
    const [x,y] = rig.joints[key].pivot;
    return `rotate(${angle} ${x} ${y})`;
  };
  parts.root.setAttribute('transform', `translate(${pose.sway} ${pose.bob})`);
  const [bodyX,bodyY]=pose.bodyPivot??[rig.groundAnchor[0],425];
  const lean = `rotate(${pose.lean} ${bodyX} ${bodyY})`;
  parts.body.setAttribute('transform', lean);
  parts.head.setAttribute('transform', `${lean} ${rotate('head', pose.head)}`);
  parts.leftArm.setAttribute('transform', `${lean} ${rotate('leftArm', pose.armLeft ?? -pose.arm)}`);
  parts.rightArm.setAttribute('transform', `${lean} ${rotate('rightArm', pose.armRight ?? pose.arm)}`);
  for(const [hand,matrix] of Object.entries(pose.handTransforms??{})){
    const key=hand==='near'?'leftArm':'rightArm';
    parts[key].setAttribute('transform',`${lean} matrix(${matrix.join(' ')})`);
  }
  parts.tail.setAttribute('transform', `${lean} ${rotate('tail', pose.tail)}`);
  // Keep the near hip visible over the shirt using the existing leg artwork.
  if(rig.interaction?.nearLegFront)parts.root.insertBefore(parts.leftLeg,parts.head);
  parts.leftEar.setAttribute('transform', rotate('leftEar', pose.earLeft));
  parts.rightEar.setAttribute('transform', rotate('rightEar', pose.earRight));
  const gaze = pose.gaze ?? { x: 0, y: 0 };
  parts.leftPupil.setAttribute('transform', `translate(${gaze.x} ${gaze.y})`);
  parts.rightPupil.setAttribute('transform', `translate(${gaze.x} ${gaze.y})`);
  ['leftLeg','rightLeg'].forEach((key, index) => {
    const hip = rig.joints[key].pivot;
    const height = rig.motion.feet[key][1] - hip[1];
    const foot = pose.feet[index];
    // Shear a short leg from its hip while keeping the sole horizontal.
    const shear = foot.x / height;
    const stretch = 1 + foot.y / height;
    parts[key].setAttribute('transform', `matrix(1 0 ${shear} ${stretch} ${-shear * hip[1]} ${hip[1] * (1 - stretch)})`);
  });
  const markers = svg.querySelector('.rig-points');
  if (markers) markers.setAttribute('transform', lean);
}

export class CharacterMotion {
  constructor(actor, rig) {
    this.actor = actor;
    this.svg = actor.querySelector('.character-art');
    this.rig = rig;
    this.parts = getCharacterParts(this.svg, rig);
    this.direction = 1;
    this.resize();
  }
  resize() {
    const box = this.svg.getBoundingClientRect();
    this.scale = Math.min(box.width / this.rig.viewBox[2], box.height / this.rig.viewBox[3]);
  }
  face(left) {
    this.direction = left ? -1 : 1;
    this.actor.querySelector('.art-wrap').classList.toggle('flipped', left);
  }
  render(pose) {
    this.actor.style.transform = `translateX(${pose.position * this.scale * this.direction}px)`;
    applyCharacterPose(this.svg, this.rig, this.parts, pose);
  }
}
