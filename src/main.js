import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { installFog, fogUniforms } from './shaders/fog.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createGrass } from './world/grass.js';
import { createTrees } from './world/trees.js';
import { createGraveyard } from './world/graveyard.js';
import { createHouse } from './world/house.js';
import { createMist } from './world/mist.js';
import { Pumpkins } from './actors/pumpkins.js';
import { Ghosts } from './actors/ghosts.js';
import { Bats } from './actors/bats.js';
import { Wisps } from './actors/wisps.js';
import { Onibi } from './actors/onibi.js';
import { GlowPoints, glowPointUniforms } from './fx/glowpoints.js';
import { Particles } from './fx/particles.js';
import { Candy } from './fx/candy.js';
import { Leaves } from './fx/leaves.js';
import { Lightning } from './fx/lightning.js';
import { Fireworks } from './fx/fireworks.js';
import { createPost } from './post.js';
import { SpookyAudio } from './audio.js';
import { Game } from './game.js';
import { UI } from './ui.js';

installFog();

const canvas = document.getElementById('scene');
const ui = new UI();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('start-label').textContent = 'WebGL を使えない環境です';
  throw e;
}
const maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
let dpr = maxDpr;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---------------------------------------------------------------- environment
const env = {
  moonDir: new THREE.Vector3(-0.35, 0.15, -1).normalize(),
  fogColor: new THREE.Color().setRGB(0.032, 0.026, 0.068),
  moonGlow: new THREE.Color().setRGB(0.3, 0.33, 0.55),
  mistColor: new THREE.Color().setRGB(0.07, 0.07, 0.13),
  lanternColor: new THREE.Color().setRGB(0.35, 1.0, 0.82),
  uniforms: { uTime: { value: 0 } },
  glows: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -100, 0, 0)) },
  lanternPos: { value: new THREE.Vector3(0, -100, 0) },
  occluders: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -100, 0, 0)) },
  flash: { value: 0 },
};
fogUniforms.fogMoonDir.value.copy(env.moonDir);
fogUniforms.fogMoonColor.value.copy(env.moonGlow).multiplyScalar(0.45);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(env.fogColor.clone(), 0.022);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(0, 4, 18);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
controls.enabled = false;

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(new THREE.Color().setRGB(0.2, 0.22, 0.5), new THREE.Color().setRGB(0.05, 0.03, 0.04), 0.75);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(new THREE.Color().setRGB(0.6, 0.68, 1.0), 2.4);
const lightDir = new THREE.Vector3(env.moonDir.x, env.moonDir.y + 0.28, env.moonDir.z).normalize();
moonLight.position.copy(lightDir).multiplyScalar(70).add(new THREE.Vector3(0, 0, -4));
moonLight.target.position.set(0, 0, -4);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
const sc = moonLight.shadow.camera;
sc.left = -38;
sc.right = 38;
sc.top = 38;
sc.bottom = -38;
sc.near = 5;
sc.far = 160;
moonLight.shadow.bias = -0.0006;
moonLight.shadow.normalBias = 0.04;
moonLight.shadow.radius = 3;
scene.add(moonLight, moonLight.target);

// ---------------------------------------------------------------- world
const sky = createSky(env);
scene.add(sky.mesh);
const terrain = createTerrain(env);
scene.add(terrain.mesh, terrain.ridges);
const grass = createGrass(env);
scene.add(grass.mesh);
const trees = createTrees();
scene.add(trees.group);
const graveyard = createGraveyard();
scene.add(graveyard.group);
const house = createHouse();
scene.add(house.group);
const mist = createMist(env);
scene.add(mist.group);

const pumpkins = new Pumpkins(env, { trunks: trees.trunks, tombs: graveyard.tombs });
scene.add(pumpkins.group);
const ghosts = new Ghosts(env, graveyard.tombs, 10);
scene.add(ghosts.group);
const bats = new Bats(env, 64);
scene.add(bats.mesh, bats.eyes.points);
const wisps = new Wisps(18);
scene.add(wisps.points);
const onibi = new Onibi(env);
scene.add(onibi.points, onibi.light);

const particles = new Particles(7000);
scene.add(particles.points);
const candy = new Candy(200);
scene.add(candy.group);
const leaves = new Leaves(240);
scene.add(leaves.mesh);
const lightning = new Lightning(env);
scene.add(lightning.mesh);
const fireworks = new Fireworks(particles);

// candle flames in the graveyard
const candleFlames = new GlowPoints(graveyard.flames.length);
scene.add(candleFlames.points);

const post = createPost(renderer, scene, camera);
const audio = new SpookyAudio();

const game = new Game({
  scene, camera, controls, renderer, canvas, env, sky, terrain, pumpkins, ghosts, bats, wisps, onibi,
  particles, candy, lightning, fireworks, house, graveyard, audio, ui, post,
});

// ---------------------------------------------------------------- resize / quality
function resize() {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 48;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, dpr);
  glowPointUniforms.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
window.addEventListener('resize', resize);
resize();

// Adaptive resolution: drop the pixel ratio only after sustained slow frames, and
// creep back up when there is headroom again.
const perf = { acc: 0, frames: 0, windows: 0, slow: 0, fast: 0 };
function adaptQuality(dt) {
  perf.acc += dt;
  perf.frames++;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.frames;
  perf.acc = 0;
  perf.frames = 0;
  perf.windows++;
  if (perf.windows < 3 || document.hidden) return; // ignore warm-up
  perf.slow = avg > 1 / 40 ? perf.slow + 1 : 0;
  perf.fast = avg < 1 / 57 ? perf.fast + 1 : 0;
  if (perf.slow >= 2 && dpr > 0.75) {
    dpr = Math.max(0.75, dpr - 0.25);
    perf.slow = 0;
    resize();
  } else if (perf.fast >= 4 && dpr < maxDpr) {
    dpr = Math.min(maxDpr, dpr + 0.25);
    perf.fast = 0;
    resize();
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;
const baseHemi = hemi.intensity;
const baseMoon = moonLight.intensity;

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;
  const t = elapsed;
  env.uniforms.uTime.value = t;
  fogUniforms.fogTime.value = t;

  game.update(dt, t);
  controls.update();

  lightning.update(dt);
  const flash = env.flash.value;
  sky.uniforms.uFlash.value = flash;
  hemi.intensity = baseHemi + flash * 6;
  moonLight.intensity = baseMoon + flash * 5;

  sky.update(camera);
  terrain.update(camera);
  grass.uniforms.uLantern.value.copy(onibi.pos);
  house.update(dt, t);
  bats.setHome(house.towerTop().add(new THREE.Vector3(0, 6, 0)));
  pumpkins.update(dt, t);
  ghosts.update(dt, t, onibi.pos);
  bats.update(dt, t);
  wisps.update(dt, t, onibi.pos, game.finaleK);
  onibi.update(dt, t);
  particles.update(dt, t);
  fireworks.update(dt);
  candy.update(dt);
  leaves.update(dt, t);

  graveyard.flames.forEach((p, i) => {
    const f = 0.75 + 0.25 * Math.sin(t * 19 + i * 3.1) * Math.sin(t * 7.3 + i);
    candleFlames.set(i, p.x, p.y + Math.sin(t * 13 + i) * 0.004, p.z, 2.6 * f, 1.2 * f, 0.35 * f, 0.09 + 0.02 * f, 1);
  });
  candleFlames.commit(graveyard.flames.length);
  graveyard.crackMat.color.setRGB(0.9, 0.35, 2.4).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.3));

  post.update(t, env.moonDir, 1 - game.finaleK * 0.3);
  post.render();
  adaptQuality(dt);
  requestAnimationFrame(frame);
}

// Compile everything up-front (including things that start hidden) so the first interactions don't hitch.
const hiddenAtStart = [];
scene.traverse((o) => {
  if (!o.visible && !o.isLight) {
    hiddenAtStart.push(o);
    o.visible = true;
  }
});
renderer.compile(scene, camera);
hiddenAtStart.forEach((o) => (o.visible = false));
requestAnimationFrame(frame);
setTimeout(() => ui.ready(), 300);

document.getElementById('start').addEventListener('click', () => game.start());

// handy for debugging from the console
window.__lantern = { scene, camera, renderer, game, pumpkins, ghosts, post, env };
