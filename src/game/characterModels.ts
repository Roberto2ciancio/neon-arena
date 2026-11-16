import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { colorOf, GLOVE_COLORS, SUIT_COLORS, VISOR_COLORS } from './cosmetics'
import type { Cosmetics, PatchId } from './cosmetics'
import { createEnemyModel } from './models'
import type { EnemyModel } from './models'

const patchCache = new Map<PatchId, THREE.CanvasTexture>()

function getPatchTexture(patch: PatchId): THREE.CanvasTexture {
  const cached = patchCache.get(patch)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#1a1f24'
    context.fillRect(0, 0, 64, 64)
    context.strokeStyle = '#c8ccd0'
    context.lineWidth = 3
    context.strokeRect(3, 3, 58, 58)
    context.fillStyle = '#e8e2d0'
    context.beginPath()
    if (patch === 'bolt') {
      context.moveTo(36, 8); context.lineTo(18, 36); context.lineTo(30, 36); context.lineTo(24, 58); context.lineTo(46, 26); context.lineTo(34, 26); context.closePath()
    } else if (patch === 'star') {
      for (let index = 0; index < 10; index += 1) {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5
        const radius = index % 2 === 0 ? 24 : 10
        context.lineTo(32 + Math.cos(angle) * radius, 34 + Math.sin(angle) * radius)
      }
      context.closePath()
    } else if (patch === 'skull') {
      context.arc(32, 28, 16, 0, Math.PI * 2)
      context.rect(22, 38, 20, 14)
    }
    context.fill()
    if (patch === 'skull') {
      context.fillStyle = '#1a1f24'
      context.beginPath()
      context.arc(26, 28, 4, 0, Math.PI * 2)
      context.arc(38, 28, 4, 0, Math.PI * 2)
      context.fill()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  patchCache.set(patch, texture)
  return texture
}

/**
 * Soldato personalizzato: tuta e dettagli nei colori scelti, copricapo, maschera, zaino e
 * toppa. Le strisce sulle spalle restano nel colore della squadra per distinguere gli schieramenti.
 */
export function createSoldierModel(teamColor: number, cosmetics: Cosmetics): EnemyModel {
  const suit = colorOf(SUIT_COLORS, cosmetics.suit)
  const accent = colorOf(SUIT_COLORS, cosmetics.accent)
  const model = createEnemyModel('walker', teamColor, 'soldier', { suit, accent })
  const { head, body } = model
  const scale = model.height / 1.8
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, metalness: 0.5, roughness: 0.45 })
  const fabric = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.95 })
  const visorColor = colorOf(VISOR_COLORS, cosmetics.visor)
  const glow = new THREE.MeshStandardMaterial({ color: visorColor, emissive: visorColor, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 })
  const team = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 1.3 })
  const attach = (parent: THREE.Object3D, mesh: THREE.Mesh): THREE.Mesh => {
    mesh.castShadow = true
    parent.add(mesh)
    model.details.push(mesh)
    return mesh
  }

  // Copricapo.
  if (cosmetics.headgear === 'helmet' || cosmetics.headgear === 'cyber') {
    const helmet = attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accentMaterial))
    helmet.position.y = 0.08
    const rim = attach(head, new THREE.Mesh(new THREE.TorusGeometry(0.33 * scale, 0.025, 6, 24), dark))
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.08
    if (cosmetics.headgear === 'cyber') {
      const strip = attach(head, new THREE.Mesh(new RoundedBoxGeometry(0.36 * scale, 0.07 * scale, 0.05, 2, 0.015), glow))
      strip.position.set(0, 0.06, -0.27 * scale)
      const antenna = attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), dark))
      antenna.position.set(0.18 * scale, 0.32, 0.05)
      const tip = attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glow))
      tip.position.set(0.18 * scale, 0.47, 0.05)
    }
  } else if (cosmetics.headgear === 'hood') {
    const hood = attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.37 * scale, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), fabric))
    hood.position.set(0, 0.02, 0.04)
    hood.rotation.x = -0.25
  } else if (cosmetics.headgear === 'beret') {
    const beret = attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.27 * scale, 0.08, 16), accentMaterial))
    beret.position.set(0.04, 0.24 * scale, 0)
    beret.rotation.z = -0.25
  }

  // Maschera o visore.
  if (cosmetics.mask === 'balaclava') {
    const cloth = attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1 })))
    cloth.scale.set(1.02, 1.05, 1.04)
  } else if (cosmetics.mask === 'gas') {
    const face = attach(head, new THREE.Mesh(new RoundedBoxGeometry(0.26 * scale, 0.2 * scale, 0.12, 3, 0.04), dark))
    face.position.set(0, -0.08, -0.25 * scale)
    for (const side of [-1, 1]) {
      const filter = attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 12), accentMaterial))
      filter.position.set(side * 0.1 * scale, -0.13, -0.3 * scale)
      filter.rotation.x = Math.PI / 2
      filter.rotation.z = side * 0.5
    }
    for (const side of [-1, 1]) {
      const lens = attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), glow))
      lens.position.set(side * 0.1 * scale, 0.05, -0.29 * scale)
      lens.rotation.x = Math.PI / 2
    }
  } else if (cosmetics.mask === 'visor') {
    const visor = attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.31 * scale, 18, 8, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.35, Math.PI * 0.22), glow))
    visor.rotation.y = Math.PI / 2
  } else if (cosmetics.headgear !== 'cyber') {
    const goggles = attach(head, new THREE.Mesh(new RoundedBoxGeometry(0.3 * scale, 0.08 * scale, 0.05, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x111a20, metalness: 0.65, roughness: 0.18 })))
    goggles.position.set(0, 0.03, -0.26 * scale)
  }

  // Zaino.
  if (cosmetics.backpack === 'tactical') {
    const pack = attach(body, new THREE.Mesh(new RoundedBoxGeometry(0.42 * scale, 0.5 * scale, 0.2, 3, 0.05), fabric))
    pack.position.set(0, 0, 0.3 * scale)
    const flap = attach(body, new THREE.Mesh(new RoundedBoxGeometry(0.38 * scale, 0.16 * scale, 0.22, 2, 0.04), accentMaterial))
    flap.position.set(0, 0.2 * scale, 0.31 * scale)
  } else if (cosmetics.backpack === 'radio') {
    const radio = attach(body, new THREE.Mesh(new RoundedBoxGeometry(0.36 * scale, 0.46 * scale, 0.18, 2, 0.03), dark))
    radio.position.set(0, 0, 0.29 * scale)
    const antenna = attach(body, new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 6), dark))
    antenna.position.set(0.12 * scale, 0.6 * scale, 0.32 * scale)
    const led = attach(body, new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), team))
    led.position.set(-0.1 * scale, 0.14 * scale, 0.39 * scale)
  } else if (cosmetics.backpack === 'tank') {
    for (const side of [-1, 1]) {
      const tank = attach(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.09 * scale, 0.4 * scale, 4, 10), accentMaterial))
      tank.position.set(side * 0.12 * scale, 0, 0.3 * scale)
      const ring = attach(body, new THREE.Mesh(new THREE.TorusGeometry(0.095 * scale, 0.012, 6, 16), glow))
      ring.position.set(side * 0.12 * scale, 0.1 * scale, 0.3 * scale)
      ring.rotation.x = Math.PI / 2
    }
  }

  // Toppa sulla spalla sinistra e strisce di squadra.
  if (cosmetics.patch !== 'none') {
    const patch = attach(model.leftArm, new THREE.Mesh(new THREE.PlaneGeometry(0.12 * scale, 0.12 * scale), new THREE.MeshStandardMaterial({ map: getPatchTexture(cosmetics.patch), roughness: 0.9, side: THREE.DoubleSide })))
    patch.position.set(-0.115 * scale, 0.12 * scale, 0)
    patch.rotation.y = -Math.PI / 2
  }
  for (const arm of [model.leftArm, model.rightArm]) {
    const band = attach(arm, new THREE.Mesh(new THREE.CylinderGeometry(0.108 * scale, 0.108 * scale, 0.06, 12, 1, true), team))
    band.position.y = 0.02
  }
  // Guanti.
  const gloves = new THREE.MeshStandardMaterial({ color: colorOf(GLOVE_COLORS, cosmetics.gloves), roughness: 0.9 })
  for (const arm of [model.leftArm, model.rightArm]) {
    const hand = arm.children.find((child) => child instanceof THREE.Mesh && child.position.y < 0)
    if (hand instanceof THREE.Mesh) hand.material = gloves
  }
  return model
}
