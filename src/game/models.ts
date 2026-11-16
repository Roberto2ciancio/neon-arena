import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { EnemyKind } from './types'

export interface WeaponModel {
  group: THREE.Group
  muzzle: THREE.Object3D
  flash: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
}

export interface EnemyModel {
  group: THREE.Group
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  head: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  leftLeg: THREE.Mesh
  rightLeg: THREE.Mesh
  leftArm: THREE.Mesh
  rightArm: THREE.Mesh
  weakPoint: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  details: THREE.Object3D[]
  height: number
}

export function createWeaponModel(): WeaponModel {
  const group = new THREE.Group()
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4851, metalness: 0.92, roughness: 0.27 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.35, roughness: 0.58 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x4debd9, emissive: 0x20aa9e, emissiveIntensity: 0.65, metalness: 0.5, roughness: 0.3 })
  const gloveMaterial = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.93 })

  const receiver = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.2, 0.72, 3, 0.025), gunMaterial)
  receiver.position.set(0, 0, -0.28)
  group.add(receiver)
  const handguard = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.15, 0.5, 3, 0.018), darkMaterial)
  handguard.position.set(0, 0.015, -0.82)
  group.add(handguard)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.42, 16), gunMaterial)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.035, -1.22)
  group.add(barrel)
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.16, 12), gunMaterial)
  muzzleBrake.rotation.x = Math.PI / 2
  muzzleBrake.position.set(0, 0.035, -1.42)
  group.add(muzzleBrake)
  const stock = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 0.38, 3, 0.025), darkMaterial)
  stock.position.set(0, -0.025, 0.25)
  stock.rotation.x = -0.12
  group.add(stock)
  const grip = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.3, 0.15, 3, 0.025), darkMaterial)
  grip.position.set(0, -0.22, -0.12)
  grip.rotation.x = -0.25
  group.add(grip)
  const magazine = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.32, 0.2, 3, 0.018), gunMaterial)
  magazine.position.set(0, -0.23, -0.42)
  magazine.rotation.x = 0.14
  group.add(magazine)
  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 24), darkMaterial)
  sight.position.set(0, 0.145, -0.35)
  group.add(sight)
  const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), accentMaterial)
  sightDot.position.set(0, 0.145, -0.445)
  group.add(sightDot)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.025, 0.32), accentMaterial)
  strip.position.set(0, 0.105, -0.55)
  group.add(strip)

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.82), darkMaterial)
  rail.position.set(0, 0.125, -0.55)
  group.add(rail)
  for (let index = 0; index < 9; index += 1) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.035), gunMaterial)
    tooth.position.set(0, 0.145, -0.2 - index * 0.085)
    group.add(tooth)
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.12, -0.42]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12), darkMaterial)
      screw.rotation.z = Math.PI / 2
      screw.position.set(side * 0.094, 0.025, z)
      group.add(screw)
    }
  }
  const chargingHandle = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.035, 0.08, 2, 0.01), darkMaterial)
  chargingHandle.position.set(0, 0.07, 0.01)
  group.add(chargingHandle)

  const rightHand = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.15, 0.22, 3, 0.045), gloveMaterial)
  rightHand.position.set(0.03, -0.19, -0.05)
  group.add(rightHand)
  const leftHand = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.14, 0.24, 3, 0.045), gloveMaterial)
  leftHand.position.set(-0.02, -0.1, -0.8)
  group.add(leftHand)

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.035, -1.51)
  group.add(muzzle)
  const flash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13),
    new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0.9 }),
  )
  flash.scale.set(0.7, 0.7, 2.5)
  flash.visible = false
  const flashLight = new THREE.PointLight(0xffa34d, 7, 3)
  flash.add(flashLight)
  muzzle.add(flash)
  group.visible = false
  return { group, muzzle, flash }
}

export function createEnemyModel(kind: EnemyKind, color: number, appearance: 'zombie' | 'soldier' = 'zombie'): EnemyModel {
  const group = new THREE.Group()
  const details: THREE.Object3D[] = []
  const soldier = appearance === 'soldier'
  const height = kind === 'brute' ? 2.65 : kind === 'armored' ? 2.05 : kind === 'crawler' ? 1.05 : kind === 'runner' ? 1.75 : 1.85
  const scale = height / 1.8
  const width = (kind === 'armored' ? 0.95 : kind === 'brute' ? 1.05 : kind === 'runner' ? 0.52 : 0.66) * scale
  const skin = new THREE.MeshStandardMaterial({ color: soldier ? 0x8b6b57 : color, emissive: soldier ? 0x000000 : color, emissiveIntensity: soldier ? 0 : 0.08, roughness: 0.92 })
  const clothes = new THREE.MeshStandardMaterial({ color: soldier ? 0x1d252b : kind === 'runner' ? 0x39262a : 0x252a2c, roughness: 0.96 })
  const armor = new THREE.MeshStandardMaterial({ color: 0x514c45, metalness: 0.72, roughness: 0.48 })
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: color, emissiveIntensity: 1.5, roughness: 0.4 })

  const body = new THREE.Mesh(soldier ? new RoundedBoxGeometry(width, 0.75 * scale, 0.4 * scale, 3, 0.07) : new THREE.BoxGeometry(width, 0.75 * scale, 0.4 * scale), clothes)
  body.position.y = 1.12 * scale
  if (kind === 'runner') body.rotation.x = -0.28
  if (kind === 'crawler') {
    body.rotation.x = 1.05
    body.position.y = 0.58
    body.position.z = 0.15
  }
  group.add(body)
  const wound = new THREE.Mesh(new THREE.BoxGeometry(width * 0.35, 0.16 * scale, 0.035), skin)
  wound.position.set(width * 0.15, 0.08, -0.22 * scale)
  wound.visible = !soldier
  body.add(wound)

  const head = new THREE.Mesh(soldier ? new THREE.SphereGeometry(0.29 * scale, 16, 12) : new THREE.DodecahedronGeometry(0.29 * scale), skin)
  head.scale.set(0.85, 1.1, 0.9)
  head.position.y = height - 0.22 * scale
  if (kind === 'crawler') {
    head.position.y = 0.65
    head.position.z = -0.55
  }
  group.add(head)
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.27 * scale, 0.045 * scale, 0.03), glow)
  eyes.position.set(0, 0.035, -0.25 * scale)
  head.add(eyes)
  if (soldier) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor)
    helmet.position.y = 0.08
    head.add(helmet)
    const visor = new THREE.Mesh(new RoundedBoxGeometry(0.34 * scale, 0.1 * scale, 0.055, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x111a20, metalness: 0.65, roughness: 0.18 }))
    visor.position.set(0, 0.025, -0.26 * scale)
    head.add(visor)
    const vest = new THREE.Mesh(new RoundedBoxGeometry(width * 0.95, 0.62 * scale, 0.12, 3, 0.035), armor)
    vest.position.set(0, 0, -0.24 * scale)
    body.add(vest)
    for (const x of [-0.2, 0, 0.2]) {
      const pouch = new THREE.Mesh(new RoundedBoxGeometry(0.15 * scale, 0.22 * scale, 0.1, 2, 0.02), clothes)
      pouch.position.set(x * scale, -0.18 * scale, -0.33 * scale)
      body.add(pouch)
      details.push(pouch)
    }
    details.push(helmet, visor, vest)
  }

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.82 * scale, 0.23 * scale), clothes)
  leftLeg.position.set(-0.18 * scale, 0.41 * scale, 0)
  group.add(leftLeg)
  const rightLeg = leftLeg.clone()
  rightLeg.position.x *= -1
  group.add(rightLeg)

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.17 * scale, 0.82 * scale, 0.18 * scale), skin)
  leftArm.position.set(-(width / 2 + 0.12 * scale), 1.05 * scale, -0.08)
  group.add(leftArm)
  const rightArm = leftArm.clone()
  rightArm.position.x *= -1
  group.add(rightArm)
  const claws = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, 0.25 * scale, 4), skin)
  claws.position.set(0, -0.48 * scale, -0.05)
  claws.visible = !soldier
  leftArm.add(claws)
  const rightClaws = claws.clone()
  rightClaws.visible = !soldier
  rightArm.add(rightClaws)

  let weakPoint: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  if (kind === 'crawler') {
    weakPoint = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.65), glow)
    weakPoint.position.set(0, 0.78, 0.18)
    group.add(weakPoint)
  } else if (kind === 'spitter' || kind === 'screamer') {
    weakPoint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow)
    weakPoint.scale.set(1, 1.35, 0.7)
    weakPoint.position.set(0, 1.47 * scale, -0.27 * scale)
    group.add(weakPoint)
  } else if (kind === 'armored') {
    const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(width * 1.08, 0.72 * scale, 0.12), armor)
    frontPlate.position.set(0, 1.15 * scale, -0.27 * scale)
    group.add(frontPlate)
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.2 * scale, 0.5 * scale), armor)
    helmet.position.set(0, height - 0.08, 0)
    group.add(helmet)
    weakPoint = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 8), glow)
    weakPoint.rotation.x = Math.PI / 2
    weakPoint.position.set(0, 1.2 * scale, 0.34 * scale)
    group.add(weakPoint)
  } else if (kind === 'brute') {
    weakPoint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), glow)
    weakPoint.position.set(0, 1.25 * scale, -0.31 * scale)
    group.add(weakPoint)
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.18), armor)
    hammer.position.set(0, -0.65, 0)
    rightArm.add(hammer)
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.3, 0.35), armor)
    hammerHead.position.y = -0.65
    hammer.add(hammerHead)
  } else {
    weakPoint = new THREE.Mesh(new THREE.SphereGeometry(0.24 * scale, 8, 6), glow)
    weakPoint.position.copy(head.position)
    weakPoint.visible = false
    group.add(weakPoint)
  }

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(width * 0.55, width * 0.68, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
  )
  floorRing.rotation.x = -Math.PI / 2
  floorRing.position.y = 0.02
  group.add(floorRing)

  return { group, body, head, leftLeg, rightLeg, leftArm, rightArm, weakPoint, details, height }
}
