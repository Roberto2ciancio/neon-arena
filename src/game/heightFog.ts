import * as THREE from 'three'

/**
 * Nebbia con altezza (Fase D): la nebbia esponenziale di Three, più fitta vicino al suolo e
 * più rada in alto, con una foschia bassa che si vede solo in lontananza. Si modificano una
 * volta sola, all'avvio, i pezzi di shader della nebbia: valori costanti, nessuna uniform in
 * più, nessuna ricompilazione durante la partita. La quota del frammento si ricava dalla
 * posizione in vista, quindi vale per ogni materiale con nebbia (anche sprite e particelle).
 */
export const HEIGHT_FOG = {
  /** Sopra il suolo la nebbia si dirada fino a questa quota relativa. */
  minimum: 0.4,
  falloff: 0.11,
  /** Foschia bassa: spessore e intensità massima, visibile oltre `mistStart` metri. */
  mistHeight: 1.4,
  mistStrength: 0.22,
  mistStart: 5,
  mistEnd: 30,
} as const

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Stessa formula dello shader, per i test e per capire i numeri. */
export function getHeightFogFactor(baseFactor: number, height: number, depth: number): number {
  const fade = HEIGHT_FOG.minimum + (1 - HEIGHT_FOG.minimum) * Math.exp(-Math.max(height, 0) * HEIGHT_FOG.falloff)
  const mist = (1 - smoothstep(0, HEIGHT_FOG.mistHeight, height)) * HEIGHT_FOG.mistStrength * smoothstep(HEIGHT_FOG.mistStart, HEIGHT_FOG.mistEnd, depth)
  const fog = baseFactor * fade
  return Math.min(1, Math.max(0, fog + mist * (1 - fog)))
}

const glsl = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value))

let installed = false

export function installHeightFog(): void {
  if (installed) return
  installed = true
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif
`
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // Quota nel mondo: inversa della matrice di vista applicata alla posizione in vista.
  vFogHeight = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;
#endif
`
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float fogFade = ${glsl(HEIGHT_FOG.minimum)} + ${glsl(1 - HEIGHT_FOG.minimum)} * exp( - max( vFogHeight, 0.0 ) * ${glsl(HEIGHT_FOG.falloff)} );
  float fogMist = ( 1.0 - smoothstep( 0.0, ${glsl(HEIGHT_FOG.mistHeight)}, vFogHeight ) ) * ${glsl(HEIGHT_FOG.mistStrength)} * smoothstep( ${glsl(HEIGHT_FOG.mistStart)}, ${glsl(HEIGHT_FOG.mistEnd)}, vFogDepth );
  fogFactor *= fogFade;
  fogFactor = clamp( fogFactor + fogMist * ( 1.0 - fogFactor ), 0.0, 1.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
}
