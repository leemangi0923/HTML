// One scene unit is 50 mm. A 0.2 m body cannot pass through the workbench.
export const ROOM = { minX: -50, maxX: 50, minZ: -43, maxZ: 43, floor: -15, radius: 4 };
export const TABLE = { minX: -15.5, maxX: 15.5, minZ: -12, maxZ: 14 };
export function blocked(x, z) {
  const r = ROOM.radius;
  return x < ROOM.minX+r || x > ROOM.maxX-r || z < ROOM.minZ+r || z > ROOM.maxZ-r ||
    (x > TABLE.minX-r && x < TABLE.maxX+r && z > TABLE.minZ-r && z < TABLE.maxZ+r);
}
export function moveBody(position, dx, dz) {
  let { x, z } = position;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx,dz)/.6));
  for(let i=0;i<steps;i++) {
    if(!blocked(x+dx/steps,z)) x+=dx/steps;
    if(!blocked(x,z+dz/steps)) z+=dz/steps;
  }
  return {x,z};
}
export function walkingDirection(forward, sideways, yaw) {
  const length=Math.max(1,Math.hypot(forward,sideways));
  forward/=length;sideways/=length;
  return {x:-Math.sin(yaw)*forward+Math.cos(yaw)*sideways,z:-Math.cos(yaw)*forward-Math.sin(yaw)*sideways};
}
