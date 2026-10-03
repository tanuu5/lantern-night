import * as THREE from 'three';

// Additive soft glowing points with per-point size / colour / alpha.
export const glowPointUniforms = {
  uScale: { value: 800 },
};

const vertexShader = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);
  gl_PointSize = clamp(aSize * uScale / depth, 0.0, 400.0);
  vColor = aColor;
  // fade very small points instead of letting them alias, and fade into distant haze
  vAlpha = aAlpha * smoothstep(0.0, 1.5, gl_PointSize) * exp(-depth * 0.012);
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 10.0);
  float halo = exp(-d * 3.2) * 0.45;
  float a = (core * 1.4 + halo) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

let sharedMaterial = null;
export function glowPointMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.ShaderMaterial({
      uniforms: glowPointUniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      fog: false,
    });
  }
  return sharedMaterial;
}

export class GlowPoints {
  constructor(capacity) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.points = new THREE.Points(g, glowPointMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.count = 0;
  }

  set(i, x, y, z, r, gr, b, size, alpha) {
    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.colors[i3] = r;
    this.colors[i3 + 1] = gr;
    this.colors[i3 + 2] = b;
    this.sizes[i] = size;
    this.alphas[i] = alpha;
  }

  commit(count) {
    this.count = count;
    this.geometry.setDrawRange(0, count);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
