import * as THREE from 'three'
import type { AttachmentSelection } from './attachments'
import { createSoldierModel } from './characterModels'
import type { CamoId, Cosmetics } from './cosmetics'
import { disposeObject } from './equipmentModels'
import { createMeleeView, createViewWeapon } from './weaponModels'
import type { MeleeId, WeaponDefinition } from './weapons'

export type PreviewSubject =
  | { kind: 'weapon'; weapon: WeaponDefinition; attachments: AttachmentSelection; camo: CamoId }
  | { kind: 'melee'; id: MeleeId }
  | { kind: 'character'; cosmetics: Cosmetics }

/** Anteprima 3D rotante dell'armeria, con un renderer dedicato attivo solo a schermata aperta. */
export class ArmoryPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50)
  private readonly pivot = new THREE.Group()
  private subject: THREE.Object3D | null = null
  private frame = 0
  private running = false
  private last = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene.add(new THREE.HemisphereLight(0xb9c9ff, 0x20202a, 2.2))
    const key = new THREE.DirectionalLight(0xffffff, 2.6)
    key.position.set(2, 3, 4)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x58f5e5, 2.2)
    rim.position.set(-3, 2, -3)
    this.scene.add(rim)
    const floor = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.74, 48), new THREE.MeshBasicMaterial({ color: 0x58f5e5, transparent: true, opacity: 0.45, side: THREE.DoubleSide }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.95
    this.scene.add(floor, this.pivot)
  }

  show(subject: PreviewSubject): void {
    if (this.subject) {
      this.pivot.remove(this.subject)
      disposeObject(this.subject)
    }
    let object: THREE.Object3D
    if (subject.kind === 'weapon') {
      const model = createViewWeapon(subject.weapon, subject.attachments, { camo: subject.camo, hands: false })
      model.group.visible = true
      model.group.rotation.y = Math.PI / 2
      const box = new THREE.Box3().setFromObject(model.group)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.group.position.sub(center)
      const holder = new THREE.Group()
      holder.add(model.group)
      holder.scale.setScalar(1.5 / Math.max(size.x, size.y, size.z, 0.4))
      object = holder
      this.camera.position.set(0, 0.25, 2.6)
    } else if (subject.kind === 'melee') {
      const group = createMeleeView(subject.id)
      group.visible = true
      group.children.slice(0, 1).forEach((hand) => { hand.visible = false })
      group.rotation.set(0, Math.PI / 2, -0.4)
      group.scale.setScalar(2.4)
      object = group
      this.camera.position.set(0, 0.25, 2.6)
    } else {
      const model = createSoldierModel(0x58f5e5, subject.cosmetics)
      model.group.position.y = -0.95
      model.leftArm.rotation.x = -0.15
      model.rightArm.rotation.x = -0.15
      object = model.group
      this.camera.position.set(0, 0.25, 5.2)
    }
    this.camera.lookAt(0, subject.kind === 'character' ? 0 : 0, 0)
    this.subject = object
    this.pivot.add(object)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.frame = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private readonly loop = (time: number): void => {
    if (!this.running) return
    const delta = Math.min(0.05, (time - this.last) / 1000)
    this.last = time
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width > 0 && height > 0 && (this.canvas.width !== Math.round(width * this.renderer.getPixelRatio()) || this.camera.aspect !== width / height)) {
      this.renderer.setSize(width, height, false)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
    }
    this.pivot.rotation.y += delta * 0.6
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.loop)
  }
}
