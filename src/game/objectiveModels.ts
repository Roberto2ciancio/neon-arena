import * as THREE from 'three'
import type { GeneratorState } from './objectives'

/**
 * Modelli degli obiettivi: generatore (Stazione 13) e colonna di luce della zona di
 * estrazione. Creati una volta sola e riposizionati a ogni partita; nessuna luce in più.
 */
export function createGeneratorModel(): THREE.Group {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.55, metalness: 0.6 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 1.5), metal)
  base.position.y = 0.175
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.25, 1.2), new THREE.MeshStandardMaterial({ color: 0x5a4a2e, roughness: 0.7, metalness: 0.35 }))
  body.position.y = 0.95
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.3 }))
  core.rotation.z = Math.PI / 2
  core.position.set(0, 1.1, 0.62)
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 10), metal)
  exhaust.position.set(0.6, 1.9, -0.3)
  for (const mesh of [base, body, core, exhaust]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  group.userData.core = core
  return group
}

/** Spento: nucleo scuro; in avvio: lampeggia; acceso: luce fissa. */
export function setGeneratorLook(group: THREE.Group, state: GeneratorState, time: number): void {
  const core = group.userData.core as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined
  if (!core) return
  core.material.emissiveIntensity = state === 'on' ? 2.4 : state === 'starting' ? 1.2 + Math.sin(time * 9) * 0.9 : 0.05
}

export function createBeacon(): THREE.Group {
  const group = new THREE.Group()
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.1, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x58f5e5, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  column.position.y = 15
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.5, 48),
    new THREE.MeshBasicMaterial({ color: 0x58f5e5, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  group.add(column, ring)
  return group
}
