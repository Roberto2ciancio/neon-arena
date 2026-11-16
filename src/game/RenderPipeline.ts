import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { GraphicsQuality } from './graphics'

export class RenderPipeline {
  private readonly composer: EffectComposer
  private readonly ambientOcclusion: SSAOPass
  private readonly bloom: UnrealBloomPass
  private readonly output: OutputPass
  private readonly environment: THREE.Texture
  private highQuality = false

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.renderer.info.autoReset = false
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = this.environment
    scene.environmentIntensity = 0.45
    pmrem.dispose()
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))
    this.ambientOcclusion = new SSAOPass(scene, camera, 1, 1)
    this.ambientOcclusion.kernelRadius = 0.7
    this.ambientOcclusion.minDistance = 0.002
    this.ambientOcclusion.maxDistance = 0.08
    this.composer.addPass(this.ambientOcclusion)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.35, 0.92)
    this.composer.addPass(this.bloom)
    this.output = new OutputPass()
    this.composer.addPass(this.output)
    this.setQuality('medium')
  }

  setQuality(quality: GraphicsQuality): void {
    this.highQuality = quality === 'high'
    this.scene.environment = quality === 'low' ? null : this.environment
    this.scene.environmentIntensity = this.highQuality ? 0.45 : 0.3
    this.ambientOcclusion.enabled = this.highQuality
    this.bloom.enabled = this.highQuality
    this.output.enabled = this.highQuality
    this.renderer.toneMappingExposure = this.highQuality ? 1.05 : 1.15
  }

  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(width, height)
  }

  render(): void {
    this.renderer.info.reset()
    if (this.highQuality) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.ambientOcclusion.dispose()
    this.bloom.dispose()
    this.output.dispose()
    this.composer.dispose()
    this.environment.dispose()
  }
}
