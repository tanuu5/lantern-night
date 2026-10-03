import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Moon god-rays: radial blur of the bright moon region (HDR, before bloom & tone mapping).
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMoon: { value: new THREE.Vector2(0.3, 0.7) },
    uAspect: { value: 1.6 },
    uIntensity: { value: 0.0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uMoon;
    uniform float uAspect;
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // soft clamp: keeps tiny over-bright sprites from turning into blocky bloom squares
      float peak = max(max(col.r, col.g), col.b);
      col *= peak > 4.0 ? (4.0 + log(1.0 + (peak - 4.0))) / peak : 1.0;
      if (uIntensity <= 0.0) { gl_FragColor = vec4(col, 1.0); return; }
      const int N = 40;
      vec2 delta = (vUv - uMoon) * (0.9 / float(N));
      vec2 uv = vUv - delta * h12(vUv * 913.0 + fract(uTime) * 37.0);
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) {
        uv -= delta;
        vec3 s = min(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb, vec3(6.0));
        float l = dot(s, vec3(0.299, 0.587, 0.114));
        vec2 dm = (uv - uMoon) * vec2(uAspect, 1.0);
        float m = smoothstep(0.55, 1.6, l) * (1.0 - smoothstep(0.03, 0.2, length(dm)));
        acc += s * m * decay;
        decay *= 0.95;
      }
      col += acc * (uIntensity / float(N));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Film finish after tone mapping: chromatic fringe, vignette, purple shadow lift, grain.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.045 },
    uCA: { value: 0.0025 },
    uFade: { value: 1 },
  },
  vertexShader: GodRaysShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uFade;
    varying vec2 vUv;
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float vig = smoothstep(0.95, 0.15, length(c * vec2(1.0, 1.1)) * 1.25);
      col *= mix(1.0 - uVignette, 1.0, vig);
      col += vec3(0.014, 0.004, 0.03) * (1.0 - col);
      float g = h12(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
      col *= uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const godRays = new ShaderPass(GodRaysShader);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.8, 0.2, 0.82);
  // UnrealBloomPass truncates its Gaussian at 1 sigma, which is effectively a box blur and turns
  // small bright sprites into square halos. Rebuild the blur kernels as proper (3 sigma) Gaussians.
  const makeBlur = (bloom.getSeparableBlurMaterial || bloom.getSeperableBlurMaterial).bind(bloom);
  bloom.separableBlurMaterials.forEach((m) => m.dispose());
  bloom.separableBlurMaterials = [6, 9, 12, 15, 18].map((r) => {
    const m = makeBlur(r);
    const sigma = r / 3;
    m.uniforms.gaussianCoefficients.value = Array.from({ length: r }, (_, i) => Math.exp((-0.5 * i * i) / (sigma * sigma)));
    return m;
  });
  const output = new OutputPass();
  const finish = new ShaderPass(FinishShader);
  composer.addPass(renderPass);
  composer.addPass(godRays);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(finish);

  const moonWorld = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  return {
    composer,
    bloom,
    godRays,
    finish,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      finish.uniforms.uRes.value.set(w * dpr, h * dpr);
      godRays.uniforms.uAspect.value = w / h;
    },
    update(t, moonDir, strength = 1) {
      moonWorld.copy(camera.position).addScaledVector(moonDir, 400);
      ndc.copy(moonWorld).project(camera);
      camera.getWorldDirection(fwd);
      const facing = fwd.dot(moonDir);
      godRays.uniforms.uMoon.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 1.0, 1.6);
      godRays.uniforms.uIntensity.value = facing > 0 ? 0.55 * onScreen * strength : 0;
      godRays.uniforms.uTime.value = t;
      finish.uniforms.uTime.value = t;
    },
    render() {
      composer.render();
    },
  };
}
