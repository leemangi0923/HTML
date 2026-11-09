import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { EXAMPLE, validWires, pairKey, inspect } from './circuit.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene'), viewport = $('#viewport');
const STORAGE = 'task1:3d-lab:v1';
let wires = EXAMPLE.map(w => [...w]);
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved?.version === 1 && Array.isArray(saved.wires)) wires = validWires(saved.wires);
} catch { /* An unavailable store or old data must not prevent practice. */ }
let power = false, pressed = false, tool = 'wire', selected = null, hovered = null, result = inspect(wires);
const history = [];
const scene = new THREE.Scene();
scene.background = new THREE.Color('#243e38');
scene.fog = new THREE.Fog('#243e38', 30, 68);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const camera = new THREE.PerspectiveCamera(39, 1, .1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .12;
controls.minDistance = 5;
controls.maxDistance = 46;
controls.maxPolarAngle = Math.PI * .46;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
let dirty = true;
controls.addEventListener('change', () => { dirty = true; });
scene.add(new THREE.HemisphereLight('#fff8e6', '#28473b', 2.5));
const sun = new THREE.DirectionalLight('#fff1d2', 3.4);
sun.position.set(-8, 16, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 40 });
sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; scene.add(sun);
const fill = new THREE.DirectionalLight('#bfded5', 1); fill.position.set(10, 6, -8); scene.add(fill);

const materials = new Map();
function mat(color, metalness = 0, roughness = .7) {
  const key = `${color}/${metalness}/${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  return materials.get(key);
}
const cube = new THREE.BoxGeometry(1, 1, 1);
function box(x, y, z, w, h, d, color, metalness = 0) {
  const mesh = new THREE.Mesh(cube, mat(color, metalness));
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh); return mesh;
}
function cylinder(x, y, z, radius, height, material, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
function label(text, x, y, z, width = 1.2, color = '#24362f', background = '#efefe0') {
  const image = document.createElement('canvas'); image.width = 512; image.height = 112;
  const ctx = image.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 112);
  ctx.font = '600 48px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, 256, 57, 492);
  const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true }));
  sprite.position.set(x, y, z); sprite.scale.set(width, width * 112 / 512, 1); scene.add(sprite); return sprite;
}

// A low-poly workshop: shared boxes, simple hardware and no external model downloads.
box(0, -1.04, 0, 17.5, .45, 12, '#6d7b5e');
box(0, -.68, 0, 15.3, .25, 10.5, '#acae98', .4);
box(0, -.42, 0, 14.5, .28, 9.6, '#dadac7', .25);
for (const x of [-6, 6]) for (const z of [-3.7, 3.7]) {
  box(x, -2.6, z, .55, 3, .55, '#344a40', .3);
  cylinder(x, -.24, z, .12, .05, mat('#919a8d', .7));
}
const floor = box(0, -4.2, 0, 100, .2, 100, '#2d493f'); floor.castShadow = false;
const grid = new THREE.GridHelper(80, 40, '#476353', '#3d594a'); grid.position.y = -4.08; scene.add(grid);
for (const z of [-1.65, 2.05]) {
  box(0, -.13, z, 11.8, .16, .55, '#a5b2a3', .7);
  box(0, -.02, z - .24, 11.8, .09, .07, '#d5dcd0', .6);
  box(0, -.02, z + .24, 11.8, .09, .07, '#d5dcd0', .6);
}
for (const x of [-6.6, 6.6]) {
  box(x, -.02, 0, .45, .45, 8.8, '#b5b9a6');
  for (let z = -4.1; z < 4.2; z += .36) box(x, .215, z, .48, .03, .035, '#747f6f');
}
label('24V CONTROL / 3D LAB', -3.8, -.02, -4.1, 3.1, '#415147', '#dadac7');

// PSU, a normally-open pushbutton, a one-pole relay and a pilot lamp.
box(-4.25, .45, -1.65, 2.6, 1.05, 2.7, '#c7ccbb', .25);
box(-4.25, 1.01, -1.65, 2.25, .1, 1.1, '#e5e6d6');
for (let x = -5.15; x <= -3.3; x += .18) box(x, 1.08, -1.85, .055, .035, .55, '#758879');
label('DC 24V', -4.25, 1.32, -1.25, 1.7);
const supplyLED = cylinder(-3.36, 1.1, -1.25, .065, .05, new THREE.MeshStandardMaterial({ color: '#344b2c' }));
box(.15, .15, -1.65, 2.5, .4, 2.8, '#31443c');
box(.15, .85, -1.65, 2.05, 1.15, 1.6, '#728c75', .25);
box(.15, 1.45, -1.65, 2.12, .12, 1.65, '#b6c8af', .3);
box(.15, 1.09, -.82, 1.65, .55, .04, '#345646');
const coil = cylinder(.15, 1.53, -1.65, .34, .12, new THREE.MeshStandardMaterial({ color: '#c58d44', metalness: .5, roughness: .6 }));
label('K1 · 릴레이', .15, 1.98, -1.65, 2);
box(-3.4, .24, 1.95, 2.15, .5, 1.85, '#35483f');
cylinder(-3.4, .6, 1.95, .58, .18, mat('#b4c3b0', .7));
const pushCap = cylinder(-3.4, .83, 1.95, .45, .3, mat('#53885c'));
label('PB · 누름 버튼', -3.4, 1.32, 1.95, 2.1);
box(3.6, .24, 1.95, 2.15, .5, 1.85, '#35483f');
cylinder(3.6, .6, 1.95, .58, .18, mat('#b4c3b0', .7));
const lampMaterial = new THREE.MeshStandardMaterial({ color: '#716323', emissive: '#ffdc65', emissiveIntensity: 0, roughness: .35 });
const lamp = cylinder(3.6, .85, 1.95, .45, .32, lampMaterial);
label('H1 · 표시등', 3.6, 1.32, 1.95, 1.85);

const terms = new Map(), targets = [];
const screwGeometry = new THREE.CylinderGeometry(.125, .125, .09, 16);
const targetGeometry = new THREE.CylinderGeometry(.25, .25, .17, 16);
const targetMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function terminal(id, x, y, z, title = id) {
  cylinder(x, y - .07, z, .19, .16, mat('#c8ac50', .5));
  const screw = new THREE.Mesh(screwGeometry, mat('#d1d7c8', .8)); screw.position.set(x, y + .05, z); scene.add(screw);
  box(x, y + .1, z, .15, .008, .025, '#526256', .5);
  const hit = new THREE.Mesh(targetGeometry, targetMaterial); hit.position.set(x, y + .1, z); hit.userData.id = id; scene.add(hit); targets.push(hit);
  const tag = label(title.split(' · ').at(-1), x, y + .42, z + .23, .95); tag.visible = false;
  terms.set(id, { position: new THREE.Vector3(x, y + .11, z), title, hit, tag });
}
terminal('DC.+', -4.8, 1.04, -.6, 'DC · +24V'); terminal('DC.-', -3.7, 1.04, -.6, 'DC · 0V');
terminal('PB.1', -4.1, .6, 2.62, 'PB · 1'); terminal('PB.2', -2.7, .6, 2.62, 'PB · 2');
terminal('K1.A1', -.55, .48, -.5, 'K1 · A1'); terminal('K1.A2', .85, .48, -.5, 'K1 · A2');
terminal('K1.11', -.55, .48, -2.78, 'K1 · 11'); terminal('K1.14', .85, .48, -2.78, 'K1 · 14');
terminal('H1.+', 2.9, .6, 2.62, 'H1 · +'); terminal('H1.-', 4.3, .6, 2.62, 'H1 · −');
for (let i = 1; i <= 6; i++) {
  const x = 2.6 + (i - 1) * .55;
  box(x, .2, -1.65, .5, .65, 2.1, i === 6 ? '#a9b78b' : '#48574b');
  terminal(`TB.${i}.t`, x, .59, -2.31, `TB${i} · 위`);
  terminal(`TB.${i}.b`, x, .59, -.99, `TB${i} · 아래`);
  label(String(i), x, .7, -1.65, .35);
}
label('TB · 단자대', 4, 1.29, -1.65, 1.95);

const wireGroup = new THREE.Group(); scene.add(wireGroup);
const wireMaterial = mat('#e9b630', .08, .42);
const previewMaterial = new THREE.MeshBasicMaterial({ color: '#fff3a2', transparent: true, opacity: .6 });
let preview = null;
function curveFor(a, b, index = 0) {
  const start = terms.get(a).position.clone(), end = terms.get(b).position.clone();
  const height = Math.max(start.y, end.y) + .38 + (index % 7) * .07;
  const p = start.clone(); p.y = height;
  const q = end.clone(); q.y = height;
  const mid = p.clone().lerp(q, .5); mid.y += .16;
  return new THREE.CatmullRomCurve3([start, p, mid, q, end], false, 'centripetal');
}
function clearPreview() {
  if (preview) { scene.remove(preview); preview.geometry.dispose(); preview = null; }
}
function rebuildWires() {
  for (const mesh of [...wireGroup.children]) { wireGroup.remove(mesh); mesh.geometry.dispose(); }
  wires.forEach(([a, b], index) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curveFor(a, b, index), 44, .049, 7, false), wireMaterial);
    mesh.userData.index = index; mesh.castShadow = true; wireGroup.add(mesh);
  });
  $('#count').textContent = `전선 ${wires.length}개`;
  $('#undo').disabled = history.length === 0;
  dirty = true;
}
function ring(color) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(.26, .035, 6, 24), new THREE.MeshBasicMaterial({ color }));
  mesh.rotation.x = Math.PI / 2; mesh.visible = false; scene.add(mesh); return mesh;
}
const selectedRing = ring('#ffe68c'), hoverRing = ring('#f6f5d6');
function updateHighlights() {
  for (const [id, term] of terms) term.tag.visible = id === selected || id === hovered;
  for (const [mesh, id] of [[selectedRing, selected], [hoverRing, hovered]]) {
    mesh.visible = !!id;
    if (id) mesh.position.copy(terms.get(id).position).add(new THREE.Vector3(0, .12, 0));
  }
  clearPreview();
  if (tool === 'wire' && selected && hovered && selected !== hovered && !power) {
    preview = new THREE.Mesh(new THREE.TubeGeometry(curveFor(selected, hovered, wires.length), 32, .04, 6, false), previewMaterial); scene.add(preview);
  }
  dirty = true;
}
function message(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
function updateCircuit() {
  result = inspect(wires, power, pressed);
  if (result.short) {
    power = false; result = inspect(wires);
    message('＋24V와 0V가 직접 연결돼 전원을 껐어요. 연결한 선을 확인해요.', true);
  }
  $('#power').textContent = power ? '전원 끄기' : '전원 켜기'; $('#power').setAttribute('aria-pressed', String(power));
  $('#push').classList.toggle('held', pressed); $('#push').setAttribute('aria-pressed', String(pressed));
  $('#powerState').textContent = power ? '24V ON' : '꺼짐'; $('#powerState').classList.toggle('on', power);
  for (const [id, on] of [['relayState', result.relay], ['lampState', result.lamp]]) { $(`#${id}`).textContent = on ? 'ON' : 'OFF'; $(`#${id}`).classList.toggle('on', on); }
  coil.material.color.set(result.relay ? '#83b769' : '#c58d44');
  lampMaterial.color.set(result.lamp ? '#ffe57c' : '#716323'); lampMaterial.emissiveIntensity = result.lamp ? 1.2 : 0;
  supplyLED.material.color.set(power ? '#ace57b' : '#344b2c');
  pushCap.position.y = pressed ? .73 : .83;
  for (const id of ['undo', 'clear', 'example']) $(`#${id}`).disabled = power || (id === 'undo' && !history.length);
  dirty = true;
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, wires })); $('#saveState').textContent = '이 작업대의 배선을 저장했어요.'; }
  catch { $('#saveState').textContent = '저장 공간을 사용할 수 없어 이번 화면에서만 유지해요.'; }
}
function changeWires(next, text) {
  history.push(wires.map(w => [...w])); if (history.length > 30) history.shift();
  wires = validWires(next); selected = null; updateHighlights(); rebuildWires(); save(); message(text); updateCircuit();
}
function choose(id) {
  if (power) return message('전원을 먼저 끄고 배선을 바꿔요.', true);
  if (!selected) { selected = id; message(`${terms.get(id).title} 선택 · 연결할 다른 단자를 눌러요. (Esc로 취소)`); }
  else if (selected === id) { selected = null; message('선택을 취소했어요. 단자 두 개를 차례로 눌러요.'); }
  else if (wires.some(w => pairKey(...w) === pairKey(selected, id))) { message('이미 연결된 단자예요. 다른 단자를 선택해요.', true); }
  else if (wires.length >= 120) { message('시제품에서는 전선을 120개까지 사용할 수 있어요.', true); }
  else { changeWires([...wires, [selected, id]], '연결했어요. 전원을 켜고 PB를 눌러 시험해요.'); }
  updateHighlights();
}

const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
function ray(event, objects) {
  const rect = canvas.getBoundingClientRect();
  mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(mouse, camera); return raycaster.intersectObjects(objects, false)[0]?.object;
}
let pointer = null;
const activePointers = new Set();
canvas.addEventListener('pointerdown', event => {
  activePointers.add(event.pointerId);
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, moved: activePointers.size > 1 };
});
canvas.addEventListener('pointermove', event => {
  if (pointer && (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5 || event.pointerId !== pointer.id)) pointer.moved = true;
  const hit = ray(event, tool === 'wire' ? targets : wireGroup.children);
  const id = tool === 'wire' ? hit?.userData.id || null : null;
  if (id !== hovered) { hovered = id; updateHighlights(); }
  const tooltip = $('#hover'); tooltip.hidden = !hit || !!event.buttons;
  if (hit) {
    tooltip.textContent = id ? terms.get(id).title : '이 전선 지우기';
    const rect = viewport.getBoundingClientRect();
    tooltip.style.left = `${Math.max(4, Math.min(event.clientX - rect.left + 16, rect.width - 135))}px`;
    tooltip.style.top = `${Math.max(4, event.clientY - rect.top - 38)}px`;
  }
  canvas.style.cursor = hit && !event.buttons ? (tool === 'erase' ? 'crosshair' : 'pointer') : 'grab';
});
canvas.addEventListener('pointerup', event => {
  activePointers.delete(event.pointerId);
  const click = pointer && pointer.id === event.pointerId && !pointer.moved && pointer.button === 0;
  pointer = null;
  if (!click) return;
  if (tool === 'wire') {
    const hit = ray(event, targets); if (hit) choose(hit.userData.id);
  } else {
    const hit = ray(event, wireGroup.children);
    if (!hit) return;
    if (power) return message('전원을 먼저 끄고 전선을 지워요.', true);
    changeWires(wires.filter((_, i) => i !== hit.userData.index), '전선을 지웠어요. 되돌리기로 복원할 수 있어요.');
  }
});
for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { activePointers.delete(event.pointerId); pointer = null; });
canvas.addEventListener('pointerleave', () => { hovered = null; $('#hover').hidden = true; updateHighlights(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => {
  tool = button.dataset.tool; selected = null; hovered = null; updateHighlights();
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  message(tool === 'wire' ? '연결할 단자 두 개를 차례로 눌러요.' : '지울 전선을 눌러요. 드래그하면 시점만 바뀌어요.');
}));
function setView(view) {
  controls.target.set(0, .15, 0);
  camera.position.set(...(view === 'top' ? [0, 24, .01] : view === 'close' ? [5.8, 11, 9] : [9.8, 14.5, 16.5]));
  camera.position.multiplyScalar(Math.min(1.8, Math.max(1, 1.15 / camera.aspect)));
  controls.update(); dirty = true;
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('#power').addEventListener('click', () => {
  power = !power; selected = null; updateHighlights(); message(power ? 'PB 누르기를 꾹 눌러 회로를 시험해요.' : '전원을 껐어요. 배선을 바꿀 수 있어요.'); updateCircuit();
});
$('#example').addEventListener('click', () => { if (!power) changeWires(EXAMPLE, '예제 배선을 불러왔어요. 전원을 켜고 PB를 눌러요.'); });
$('#clear').addEventListener('click', () => { if (!power) changeWires([], '작업대를 비웠어요. 단자 두 개를 눌러 연결해요.'); });
$('#undo').addEventListener('click', () => {
  if (power || !history.length) return;
  wires = history.pop(); selected = null; updateHighlights(); rebuildWires(); save(); message('이전 배선으로 돌아왔어요.'); updateCircuit();
});
function release() { if (pressed) { pressed = false; updateCircuit(); } }
$('#push').addEventListener('pointerdown', event => {
  if (event.button !== 0) return; event.preventDefault();
  $('#push').setPointerCapture(event.pointerId); pressed = true; updateCircuit();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#push').addEventListener(type, release);
$('#push').addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pressed = true; updateCircuit(); } });
$('#push').addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } });
$('#push').addEventListener('blur', release);
window.addEventListener('blur', () => { release(); pointer = null; activePointers.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); pointer = null; activePointers.clear(); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { selected = null; updateHighlights(); message('선택을 취소했어요.'); release(); } });
$('#helpToggle').addEventListener('click', () => {
  $('#help').open = !$('#help').open;
  if ($('#help').open) $('#help').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#help').addEventListener('toggle', () => $('#helpToggle').setAttribute('aria-expanded', String($('#help').open)));

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(viewport);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); power = false; pressed = false; updateCircuit();
  $('#loading').hidden = false;
  $('#loading').textContent = '3D 표시가 중단됐어요. 새로고침하면 저장된 배선으로 돌아와요.';
});
resize(); setView('iso'); rebuildWires(); updateCircuit();
renderer.setAnimationLoop(() => {
  controls.update();
  if (!dirty) return;
  renderer.render(scene, camera); dirty = false;
});
$('#loading').hidden = true;
window.LAB3D = {
  get state() { return { wires: wires.map(w => [...w]), power, pressed, selected, tool, ...result }; },
  screenPoint(id) {
    const p = terms.get(id).hit.position.clone().project(camera), rect = canvas.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  },
  screenWirePoint(index) {
    const p = curveFor(...wires[index], index).getPoint(.5).project(camera), rect = canvas.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  },
  get camera() { return camera.position.toArray(); }
};
