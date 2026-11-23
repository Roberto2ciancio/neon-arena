import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getColorGrade, getPostEffects, NEUTRAL_GRADE } from './colorGrading'
import type { ColorGrade, PostEffects } from './colorGrading'
import type { GraphicsQuality } from './graphics'
import type { MapTheme } from './maps'

/**
 * Passaggio finale unico: tone mapping ACES e conversione in sRGB (al posto dell'OutputPass),
 * poi correzione colore della mappa, vignetta, grana e aberrazione cromatica quando si è
 * feriti. Un solo passaggio a schermo intero, compilato all'avvio: cambiare i valori non
 * ricompila nulla.
 */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    lift: { value: new THREE.Vector3() },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.25 },
    grain: { value: 0 },
    aberration: { value: 0 },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform vec3 lift;
    uniform vec3 gain;
    uniform float saturation;
    uniform float contrast;
    uniform float vignette;
    uniform float grain;
    uniform float aberration;
    uniform float time;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 offset = vUv - 0.5;
      float dist = length(offset);
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;
      if (aberration > 0.0) {
        vec2 shift = offset * aberration * dist * 0.025;
        color.r = texture2D(tDiffuse, vUv + shift).r;
        color.b = texture2D(tDiffuse, vUv - shift).b;
      }
      color = sRGBTransferOETF(vec4(ACESFilmicToneMapping(color), 1.0)).rgb;
      color = color * gain + lift * (1.0 - color);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      color *= 1.0 - vignette * smoothstep(0.32, 0.9, dist);
      if (grain > 0.0) color += (hash(vUv * resolution + fract(time) * 61.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
    }
  `,
}

export class RenderPipeline {
  private composer: EffectComposer
  private readonly ambientOcclusion: SSAOPass
  private readonly bloom: UnrealBloomPass
  private readonly finish: ShaderPass
  private readonly roomEnvironment: THREE.Texture
  private environment: THREE.Texture
  private readonly themeEnvironments = new Map<MapTheme, THREE.Texture>()
  /** Tema da trasformare in ambiente appena serve (non sul basso, non due volte). */
  private pendingTheme: MapTheme | null = null
  /** Nel menu (scena dietro un velo scuro) si disegna diretto: la composizione serve in partita. */
  private compositing = false
  private effects: PostEffects = getPostEffects('medium')
  private quality: GraphicsQuality = 'medium'
  private grade: ColorGrade = NEUTRAL_GRADE
  private width = 1
  private height = 1

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.renderer.info.autoReset = false
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.environment = this.roomEnvironment
    scene.environment = this.environment
    scene.environmentIntensity = 0.45
    this.ambientOcclusion = new SSAOPass(scene, camera, 1, 1, 16)
    this.ambientOcclusion.kernelRadius = 0.7
    this.ambientOcclusion.minDistance = 0.002
    this.ambientOcclusion.maxDistance = 0.08
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.35, 0.92)
    this.finish = new ShaderPass(FinishShader)
    // Il tone mapping lo fa lo shader stesso: niente quello automatico del renderer.
    this.finish.material.toneMapped = false
    this.composer = this.createComposer(this.effects.samples)
    this.setQuality('medium')
  }

  /** Il buffer di composizione ha l'MSAA: con la composizione l'antialias del canvas non vale. */
  private createComposer(samples: number): EffectComposer {
    const target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples })
    const composer = new EffectComposer(this.renderer, target)
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(this.ambientOcclusion)
    composer.addPass(this.bloom)
    composer.addPass(this.finish)
    return composer
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality
    const previousSamples = this.effects.samples
    this.effects = getPostEffects(quality)
    if (this.effects.samples !== previousSamples) {
      this.composer.dispose()
      this.composer = this.createComposer(this.effects.samples)
      this.setSize(this.width, this.height)
    }
    const high = quality === 'high'
    this.scene.environment = quality === 'low' ? null : this.environment
    this.applyPendingEnvironment()
    // Il cielo notturno della mappa è più buio dello studio usato prima: intensità più alta.
    this.scene.environmentIntensity = high ? 0.85 : 0.6
    this.ambientOcclusion.enabled = this.effects.ambientOcclusion
    this.bloom.enabled = this.effects.bloom
    // Sempre attivo quando si compone: contiene anche tone mapping e sRGB.
    this.finish.enabled = true
    this.finish.uniforms.grain!.value = this.effects.grain
    this.renderer.toneMappingExposure = high ? 1.05 : 1.15
  }

  /** Correzione colore della mappa (vale dal prossimo frame, nessuna ricompilazione). */
  setColorGrade(mapId: string): void {
    this.grade = getColorGrade(mapId)
    const uniforms = this.finish.uniforms
    ;(uniforms.lift!.value as THREE.Vector3).set(...this.grade.lift)
    ;(uniforms.gain!.value as THREE.Vector3).set(...this.grade.gain)
    uniforms.saturation!.value = this.grade.saturation
    uniforms.contrast!.value = this.grade.contrast
    uniforms.vignette!.value = this.grade.vignette
  }

  /** Intensità 0–1 dell'aberrazione cromatica (ferite). */
  setHurt(amount: number): void {
    this.finish.uniforms.aberration!.value = this.effects.grade ? Math.max(0, Math.min(1, amount)) : 0
  }

  /**
   * Riflessi coerenti con il cielo della mappa: un cielo a gradiente con qualche lampada,
   * trasformato una volta sola in mappa d'ambiente e tenuto in memoria per mappa.
   */
  setEnvironmentTheme(theme: MapTheme): void {
    this.pendingTheme = theme
    this.applyPendingEnvironment()
  }

  /** La generazione costa: si fa solo con un preset che usa l'ambiente, al primo frame utile. */
  private applyPendingEnvironment(): void {
    const theme = this.pendingTheme
    if (!theme || this.quality === 'low') return
    this.pendingTheme = null
    let texture = this.themeEnvironments.get(theme)
    if (!texture) {
      texture = createThemeEnvironment(this.renderer, theme)
      this.themeEnvironments.set(theme, texture)
    }
    this.environment = texture
    this.scene.environment = texture
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    const pixelRatio = this.renderer.getPixelRatio()
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(this.width, this.height)
    this.ambientOcclusion.setSize(Math.max(1, Math.round(this.width * pixelRatio * 0.5)), Math.max(1, Math.round(this.height * pixelRatio * 0.5)))
    ;(this.finish.uniforms.resolution!.value as THREE.Vector2).set(this.width * pixelRatio, this.height * pixelRatio)
  }

  /** Composizione attiva solo fuori dal menu. */
  setCompositing(active: boolean): void {
    this.compositing = active
  }

  get isCompositing(): boolean {
    return this.compositing
  }

  render(): void {
    this.renderer.info.reset()
    if (!this.effects.enabled || !this.compositing) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.finish.uniforms.time!.value = performance.now() / 1000
    this.finish.uniforms.toneMappingExposure!.value = this.renderer.toneMappingExposure
    this.composer.render()
  }

  dispose(): void {
    this.ambientOcclusion.dispose()
    this.bloom.dispose()
    this.finish.dispose()
    this.composer.dispose()
    this.roomEnvironment.dispose()
    for (const texture of this.themeEnvironments.values()) texture.dispose()
  }
}

function createThemeEnvironment(renderer: THREE.WebGLRenderer, theme: MapTheme): THREE.Texture {
  const scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(50, 32, 16)
  const colors: number[] = []
  // Base neutra (come uno studio) con solo una parte del colore della mappa: i riflessi
  // prendono il tono del cielo senza tingere tutti i materiali di un colore solo.
  const tinted = (hex: number, neutral: number) => new THREE.Color(neutral).lerp(new THREE.Color(hex), 0.35)
  const top = tinted(theme.skyTop, 0x6a6f78)
  const horizon = tinted(theme.skyHorizon, 0x9aa0a8)
  const glow = tinted(theme.skyGlow, 0xb4b8bf)
  const ground = tinted(theme.hemisphereGround, 0x3a3c40)
  const position = geometry.getAttribute('position')
  const color = new THREE.Color()
  for (let index = 0; index < position.count; index += 1) {
    const height = position.getY(index) / 50
    if (height > 0.12) color.copy(horizon).lerp(top, Math.min(1, (height - 0.12) / 0.6))
    else if (height > -0.05) color.copy(glow).lerp(horizon, (height + 0.05) / 0.17)
    else color.copy(ground).multiplyScalar(0.6)
    colors.push(color.r * 1.2, color.g * 1.2, color.b * 1.2)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }))
  scene.add(sky)
  // Lampade e insegne lontane: danno ai materiali metallici e bagnati qualche riflesso vivo.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.keyLight).multiplyScalar(6) })
  const rimMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.rimLight).multiplyScalar(4) })
  const panel = new THREE.PlaneGeometry(10, 3)
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2
    const lamp = new THREE.Mesh(panel, index % 2 === 0 ? lampMaterial : rimMaterial)
    lamp.position.set(Math.cos(angle) * 40, 12 + (index % 3) * 6, Math.sin(angle) * 40)
    lamp.lookAt(0, 0, 0)
    scene.add(lamp)
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  // Un gradiente con poche lampade: 64 px bastano e la generazione costa molto meno.
  const texture = pmrem.fromScene(scene, 0.03, 0.1, 100, { size: 64 }).texture
  pmrem.dispose()
  geometry.dispose()
  panel.dispose()
  sky.material.dispose()
  lampMaterial.dispose()
  rimMaterial.dispose()
  return texture
}
