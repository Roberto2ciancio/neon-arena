import * as THREE from 'three'
import { createSoldierModel } from '../characterModels'
import { DEFAULT_COSMETICS } from '../cosmetics'
import { disposeObject } from '../equipmentModels'
import type { EnemyModel } from '../models'
import type { CoopPlayerStatus } from './coopRules'
import type { CoopLobbyPlayer, CoopPlayerState } from './coopProtocol'

const TEAMMATE_COLOR = 0x58f5e5

export interface Teammate {
  id: string
  name: string
  model: EnemyModel
  tag: THREE.Sprite
  /** Posizione dei piedi, interpolata verso l'ultimo stato ricevuto. */
  feet: THREE.Vector3
  target: THREE.Vector3
  yaw: number
  targetYaw: number
  crouch: boolean
  health: number
  status: CoopPlayerStatus
  kills: number
  phase: number
  /** Solo host: ritardo fra due danni da pozza acida. */
  hazardCooldown: number
}

function createTagTexture(name: string, status: CoopPlayerStatus): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    context.font = '600 30px "Chakra Petch", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 6
    context.strokeStyle = 'rgba(4, 8, 16, 0.9)'
    const label = status === 'down' ? `${name} // A TERRA` : name
    context.strokeText(label, 128, 32)
    context.fillStyle = status === 'down' ? '#ff6b7a' : '#58f5e5'
    context.fillText(label, 128, 32)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Compagni di squadra nella partita co-op: modelli, nomi sopra la testa e posa quando sono a terra. */
export class CoopTeammates {
  private readonly teammates = new Map<string, Teammate>()

  constructor(private readonly scene: THREE.Scene) {}

  get all(): Teammate[] {
    return [...this.teammates.values()]
  }

  get(id: string): Teammate | undefined {
    return this.teammates.get(id)
  }

  /** Aggiunge i giocatori nuovi e rimuove quelli usciti (escluso il giocatore locale). */
  sync(players: readonly CoopLobbyPlayer[], localId: string, spawn: { x: number; z: number }): void {
    const ids = new Set(players.filter((player) => player.id !== localId).map((player) => player.id))
    for (const id of [...this.teammates.keys()]) if (!ids.has(id)) this.remove(id)
    players.forEach((player, index) => {
      if (player.id === localId || this.teammates.has(player.id)) return
      const model = createSoldierModel(TEAMMATE_COLOR, player.cosmetics ?? DEFAULT_COSMETICS)
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.75), new THREE.MeshStandardMaterial({ color: 0x293542, metalness: 0.8, roughness: 0.3 }))
      gun.position.set(0.4, 1.15, -0.42)
      model.group.add(gun)
      model.leftArm.rotation.x = -1.05
      model.rightArm.rotation.x = -1.05
      const start = new THREE.Vector3(spawn.x + (index - 1.5) * 1.6, 0, spawn.z + 1.5)
      model.group.position.copy(start)
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTagTexture(player.name, 'alive'), depthTest: false, transparent: true }))
      tag.scale.set(1.6, 0.4, 1)
      tag.position.y = model.height + 0.55
      tag.renderOrder = 998
      model.group.add(tag)
      this.scene.add(model.group)
      this.teammates.set(player.id, {
        id: player.id, name: player.name, model, tag, feet: model.group.position, target: start.clone(), yaw: 0, targetYaw: 0,
        crouch: false, health: 100, status: 'alive', kills: 0, phase: Math.random() * Math.PI * 2, hazardCooldown: 0,
      })
    })
  }

  applyState(state: CoopPlayerState): void {
    const teammate = this.teammates.get(state.id)
    if (!teammate) return
    teammate.target.set(state.x, state.y, state.z)
    teammate.targetYaw = state.yaw
    teammate.crouch = state.crouch
    teammate.health = state.health
    teammate.kills = state.kills
    this.setStatus(teammate, state.status)
  }

  setStatus(teammate: Teammate, status: CoopPlayerStatus): void {
    if (teammate.status === status) return
    teammate.status = status
    const material = teammate.tag.material
    material.map?.dispose()
    material.map = createTagTexture(teammate.name, status)
    material.needsUpdate = true
  }

  update(delta: number, elapsed: number): void {
    const blend = 1 - Math.exp(-14 * delta)
    for (const teammate of this.teammates.values()) {
      const { model } = teammate
      const before = teammate.feet.clone()
      teammate.feet.lerp(teammate.target, blend)
      const yawDelta = Math.atan2(Math.sin(teammate.targetYaw - teammate.yaw), Math.cos(teammate.targetYaw - teammate.yaw))
      teammate.yaw += yawDelta * blend
      model.group.rotation.y = teammate.yaw
      model.group.visible = teammate.status !== 'dead'
      // A terra: sdraiato su un fianco, il nome resta visibile per farsi rianimare.
      const down = teammate.status === 'down'
      model.group.rotation.z = THREE.MathUtils.lerp(model.group.rotation.z, down ? 1.4 : 0, blend)
      model.body.scale.y = teammate.crouch && !down ? 0.8 : 1
      const speed = before.distanceTo(teammate.feet) / Math.max(delta, 0.001)
      const walk = down ? 0 : Math.sin(elapsed * 9 + teammate.phase) * Math.min(1, speed / 3) * 0.7
      model.leftLeg.rotation.x = walk
      model.rightLeg.rotation.x = -walk
      teammate.tag.rotation.z = -model.group.rotation.z
      teammate.hazardCooldown = Math.max(0, teammate.hazardCooldown - delta)
    }
  }

  remove(id: string): void {
    const teammate = this.teammates.get(id)
    if (!teammate) return
    this.scene.remove(teammate.model.group)
    teammate.tag.material.map?.dispose()
    disposeObject(teammate.model.group)
    this.teammates.delete(id)
  }

  clear(): void {
    for (const id of [...this.teammates.keys()]) this.remove(id)
  }
}
