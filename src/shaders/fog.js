import * as THREE from 'three';

// Shared uniforms for the custom height fog. Attached to every material via withFog().
export const fogUniforms = {
  fogTime: { value: 0 },
  fogMoonDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
  fogMoonColor: { value: new THREE.Color(0.2, 0.22, 0.35) },
  fogHeight: { value: 0.2 },
  fogTint: { value: new THREE.Color(0, 0, 0) },
};

// Replaces three.js fog with analytic exponential height fog + drifting noise
// and forward scattering toward the moon.
export function installFog() {
  // Every material gets the fog uniforms by default; withFog() keeps doing so when it adds its own edits.
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, fogUniforms);
  };

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif
`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform float fogTime;
  uniform vec3 fogMoonDir;
  uniform vec3 fogMoonColor;
  uniform float fogHeight;
  uniform vec3 fogTint;
  float fogHash( vec3 p ) {
    p = fract( p * 0.1031 );
    p += dot( p, p.zyx + 31.32 );
    return fract( ( p.x + p.y ) * p.z );
  }
  float fogNoise( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( mix( fogHash( i ), fogHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
           mix( fogHash( i + vec3( 0.0, 1.0, 0.0 ) ), fogHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
      mix( mix( fogHash( i + vec3( 0.0, 0.0, 1.0 ) ), fogHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
           mix( fogHash( i + vec3( 0.0, 1.0, 1.0 ) ), fogHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
      f.z );
  }
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 fro = cameraPosition;
    vec3 frd = vFogWorldPos - fro;
    float fdist = length( frd );
    frd /= max( fdist, 1e-4 );
    #ifdef FOG_EXP2
      float fdens = fogDensity;
    #else
      float fdens = 0.03;
    #endif
    float fbase = fdens * exp( - clamp( fro.y, -20.0, 200.0 ) * fogHeight );
    float fry = frd.y * fogHeight;
    float famt = abs( fry ) > 1e-4
      ? fbase * ( 1.0 - exp( clamp( - fdist * fry, -60.0, 60.0 ) ) ) / fry
      : fbase * fdist;
    vec3 fnp = vFogWorldPos * vec3( 0.11, 0.2, 0.11 ) + vec3( fogTime * 0.16, - fogTime * 0.04, fogTime * 0.07 );
    float fn = fogNoise( fnp ) * 0.62 + fogNoise( fnp * 2.7 + 3.1 ) * 0.38;
    famt *= 0.5 + 1.0 * fn;
    float ff = 1.0 - exp( - max( famt, 0.0 ) );
    float fmd = max( dot( frd, fogMoonDir ), 0.0 );
    float fsun = pow( fmd, 14.0 ) + pow( fmd, 3.0 ) * 0.12;
    vec3 fcol = fogColor + fogTint + fogMoonColor * fsun;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fcol, clamp( ff, 0.0, 1.0 ) );
  }
#endif
`;
}

// Attach fog uniforms (and optionally more shader edits) to a built-in material.
// `key` must be unique per distinct `extra` transform so programs aren't wrongly shared.
export function withFog(material, extra = null, key = 'fog') {
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, fogUniforms);
    if (extra) extra(shader, renderer);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// Uniform set for custom ShaderMaterials that want fog.
export function fogShaderUniforms() {
  return { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...fogUniforms };
}
