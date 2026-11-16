import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createFabricTexture, createOrganicTexture } from './textures'
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

export interface SoldierOutfit {
  suit: number
  accent: number
}

export function createEnemyModel(kind: EnemyKind, color: number, appearance: 'zombie' | 'soldier' = 'zombie', outfit?: SoldierOutfit): EnemyModel {
  const group = new THREE.Group()
  const details: THREE.Object3D[] = []
  const soldier = appearance === 'soldier'
  const height = kind === 'brute' ? 2.65 : kind === 'armored' || kind === 'shielder' ? 2.05 : kind === 'crawler' ? 1.05 : kind === 'runner' ? 1.75 : kind === 'leaper' ? 1.6 : kind === 'bloater' || kind === 'stalker' ? 1.95 : 1.85
  const scale = height / 1.8
  const width = (kind === 'armored' || kind === 'shielder' ? 0.95 : kind === 'brute' ? 1.05 : kind === 'bloater' ? 1.2 : kind === 'runner' || kind === 'stalker' ? 0.52 : kind === 'leaper' ? 0.6 : 0.66) * scale
  const skinColor = new THREE.Color(soldier ? 0x8b6b57 : 0x727768).lerp(new THREE.Color(color), soldier ? 0 : kind === 'stalker' ? 0.75 : 0.28)
  const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: createOrganicTexture(skinColor.getHex()), roughness: 0.8 })
  const clothesColor = soldier ? outfit?.suit ?? 0x1d252b : kind === 'runner' ? 0x39262a : 0x252a2c
  const clothes = new THREE.MeshStandardMaterial({ color: 0xffffff, map: createFabricTexture(clothesColor), roughness: 0.96, side: THREE.DoubleSide })
  const armor = new THREE.MeshStandardMaterial({ color: outfit?.accent ?? 0x4c5050, metalness: outfit ? 0.45 : 0.72, roughness: 0.48 })
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: color, emissiveIntensity: 1.5, roughness: 0.4 })
  const woundMaterial = new THREE.MeshStandardMaterial({ color: 0x47151a, roughness: 0.72 })
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c1a4, roughness: 0.75 })

  const body = new THREE.Mesh(new RoundedBoxGeometry(width, 0.72 * scale, 0.4 * scale, 4, 0.08 * scale), clothes)
  body.position.y = 1.12 * scale
  if (kind === 'runner') body.rotation.x = -0.28
  if (kind === 'leaper') body.rotation.x = -0.5
  if (kind === 'crawler') {
    body.rotation.x = 1.05
    body.position.y = 0.58
    body.position.z = 0.15
  }
  group.add(body)
  const pelvis = new THREE.Mesh(new RoundedBoxGeometry(width * 0.72, 0.28 * scale, 0.32 * scale, 3, 0.06), clothes)
  pelvis.position.set(0, 0.72 * scale, 0)
  group.add(pelvis)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * scale, 0.14 * scale, 0.25 * scale, 10), skin)
  neck.position.set(0, 1.52 * scale, 0)
  group.add(neck)

  if (!soldier) {
    const wound = new THREE.Mesh(new THREE.SphereGeometry(width * 0.22, 12, 8), woundMaterial)
    wound.scale.set(1, 0.65, 0.15)
    wound.position.set(width * 0.15, 0.06, -0.215 * scale)
    body.add(wound)
    details.push(wound)
    for (let index = 0; index < 4; index += 1) {
      const rag = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.24, 0.28 * scale), clothes)
      rag.position.set((index - 1.5) * width * 0.21, -0.46 * scale, -0.21 * scale)
      rag.rotation.z = (index - 1.5) * 0.12
      body.add(rag)
      details.push(rag)
    }
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29 * scale, 18, 14), skin)
  head.scale.set(0.85, 1.08, 0.92)
  head.position.y = height - 0.22 * scale
  if (kind === 'crawler') {
    head.position.y = 0.65
    head.position.z = -0.55
  }
  group.add(head)
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 10, 8), woundMaterial)
    socket.scale.set(1.2, 0.75, 0.35)
    socket.position.set(side * 0.105 * scale, 0.05 * scale, -0.255 * scale)
    head.add(socket)
    details.push(socket)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032 * scale, 10, 8), glow)
    eye.position.set(side * 0.105 * scale, 0.05 * scale, -0.285 * scale)
    head.add(eye)
  }
  const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.26 * scale, (kind === 'screamer' ? 0.2 : 0.12) * scale, 0.18 * scale, 3, 0.035), skin)
  jaw.position.set(0, -0.18 * scale, -0.19 * scale)
  if (kind === 'screamer') jaw.rotation.x = -0.4
  head.add(jaw)
  details.push(jaw)
  if (!soldier) {
    const mouth = new THREE.Mesh(new RoundedBoxGeometry(0.2 * scale, 0.065 * scale, 0.025, 2, 0.01), woundMaterial)
    mouth.position.set(0, -0.12 * scale, -0.285 * scale)
    head.add(mouth)
    details.push(mouth)
    for (const x of [-0.07, 0, 0.07]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018 * scale, 0.065 * scale, 5), toothMaterial)
      tooth.position.set(x * scale, -0.09 * scale, -0.305 * scale)
      head.add(tooth)
      details.push(tooth)
    }
  }

  if (soldier) {
    // Con un outfit personalizzato copricapo e visore li aggiunge characterModels.
    if (!outfit) {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), armor)
      helmet.position.y = 0.08
      head.add(helmet)
      const visor = new THREE.Mesh(new RoundedBoxGeometry(0.34 * scale, 0.1 * scale, 0.055, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x111a20, metalness: 0.65, roughness: 0.18 }))
      visor.position.set(0, 0.025, -0.26 * scale)
      head.add(visor)
      details.push(helmet, visor)
    }
    const vest = new THREE.Mesh(new RoundedBoxGeometry(width * 0.95, 0.62 * scale, 0.12, 3, 0.035), armor)
    vest.position.set(0, 0, -0.24 * scale)
    body.add(vest)
    for (const x of [-0.2, 0, 0.2]) {
      const pouch = new THREE.Mesh(new RoundedBoxGeometry(0.15 * scale, 0.22 * scale, 0.1, 2, 0.02), clothes)
      pouch.position.set(x * scale, -0.18 * scale, -0.33 * scale)
      body.add(pouch)
      details.push(pouch)
    }
    details.push(vest)
  }

  const legGeometry = new THREE.CapsuleGeometry(0.115 * scale, 0.58 * scale, 5, 10)
  const leftLeg = new THREE.Mesh(legGeometry, clothes)
  leftLeg.position.set(-0.18 * scale, 0.41 * scale, 0)
  const boot = new THREE.Mesh(new RoundedBoxGeometry(0.22 * scale, 0.16 * scale, 0.34 * scale, 3, 0.04), clothes)
  boot.position.set(0, -0.4 * scale, -0.08 * scale)
  leftLeg.add(boot)
  group.add(leftLeg)
  const rightLeg = leftLeg.clone()
  rightLeg.position.x *= -1
  group.add(rightLeg)

  const armGeometry = new THREE.CapsuleGeometry((kind === 'brute' ? 0.15 : 0.1) * scale, 0.58 * scale, 5, 10)
  const leftArm = new THREE.Mesh(armGeometry, soldier ? clothes : skin)
  leftArm.position.set(-(width / 2 + 0.12 * scale), 1.05 * scale, -0.08)
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry((kind === 'brute' ? 0.23 : 0.16) * scale, 12, 10), soldier ? clothes : skin)
  shoulder.position.y = 0.3 * scale
  leftArm.add(shoulder)
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 12, 8), soldier ? clothes : skin)
  hand.scale.set(0.85, 1.2, 0.7)
  hand.position.y = -0.4 * scale
  leftArm.add(hand)
  group.add(leftArm)
  const rightArm = leftArm.clone()
  rightArm.position.x *= -1
  group.add(rightArm)
  if (!soldier) {
    for (const arm of [leftArm, rightArm]) {
      for (const x of [-0.06, 0, 0.06]) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025 * scale, 0.22 * scale, 6), toothMaterial)
        claw.position.set(x * scale, -0.53 * scale, -0.04)
        claw.rotation.x = -0.3
        arm.add(claw)
        details.push(claw)
      }
    }
  }

  let weakPoint: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  if (kind === 'crawler') {
    weakPoint = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 5, 10), glow)
    weakPoint.rotation.x = Math.PI / 2
    weakPoint.position.set(0, 0.78, 0.18)
    group.add(weakPoint)
    for (const z of [-0.22, 0, 0.22]) {
      const vertebra = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), toothMaterial)
      vertebra.position.set(0, 0.88, z)
      group.add(vertebra)
      details.push(vertebra)
    }
  } else if (kind === 'spitter' || kind === 'screamer') {
    weakPoint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glow)
    weakPoint.scale.set(1, 1.35, 0.7)
    weakPoint.position.set(0, 1.47 * scale, -0.27 * scale)
    group.add(weakPoint)
  } else if (kind === 'armored') {
    const frontPlate = new THREE.Mesh(new RoundedBoxGeometry(width * 1.08, 0.72 * scale, 0.12, 3, 0.045), armor)
    frontPlate.position.set(0, 1.15 * scale, -0.27 * scale)
    group.add(frontPlate)
    const helmet = new THREE.Mesh(new RoundedBoxGeometry(0.58 * scale, 0.28 * scale, 0.52 * scale, 3, 0.06), armor)
    helmet.position.set(0, height - 0.08, 0)
    group.add(helmet)
    for (const side of [-1, 1]) {
      const shoulderPlate = new THREE.Mesh(new RoundedBoxGeometry(0.34 * scale, 0.18 * scale, 0.42 * scale, 3, 0.05), armor)
      shoulderPlate.position.set(side * width * 0.58, 1.42 * scale, 0)
      group.add(shoulderPlate)
    }
    weakPoint = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 16), glow)
    weakPoint.rotation.x = Math.PI / 2
    weakPoint.position.set(0, 1.2 * scale, 0.34 * scale)
    group.add(weakPoint)
  } else if (kind === 'bloater') {
    // Ventre gonfio e pustole luminose: il punto debole esplode.
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55 * scale, 18, 14), skin)
    belly.scale.set(1.15, 1, 1)
    belly.position.set(0, 0.95 * scale, -0.12)
    group.add(belly)
    for (const [x, y] of [[-0.3, 1.25], [0.32, 1.05], [-0.15, 0.75], [0.2, 1.4]] as const) {
      const pustule = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 10, 8), glow)
      pustule.position.set(x * scale, y * scale, -0.58 * scale)
      group.add(pustule)
      details.push(pustule)
    }
    weakPoint = new THREE.Mesh(new THREE.SphereGeometry(0.24 * scale, 14, 10), glow)
    weakPoint.position.set(0, 0.95 * scale, -0.6 * scale)
    group.add(weakPoint)
  } else if (kind === 'shielder') {
    // Scudo antisommossa improvvisato sul davanti, generatore sulla schiena.
    const shield = new THREE.Mesh(new RoundedBoxGeometry(1.1 * scale, 1.35 * scale, 0.08, 3, 0.04), armor)
    shield.position.set(0, 1.05 * scale, -0.62 * scale)
    group.add(shield)
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.06, 0.09), new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.4 }))
    slit.position.set(0, 1.5 * scale, -0.62 * scale)
    group.add(slit)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.12 * scale, 0.08, 0.09), new THREE.MeshStandardMaterial({ color: 0xd8a43c, emissive: 0x3a2508, emissiveIntensity: 0.6 }))
    stripe.position.set(0, 0.62 * scale, -0.62 * scale)
    group.add(stripe)
    details.push(slit, stripe)
    weakPoint = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 16), glow)
    weakPoint.rotation.x = Math.PI / 2
    weakPoint.position.set(0, 1.2 * scale, 0.36 * scale)
    group.add(weakPoint)
  } else if (kind === 'leaper') {
    // Spina dorsale esposta e luminosa sopra il busto piegato in avanti.
    for (const z of [-0.18, 0.02, 0.22]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), toothMaterial)
      spike.position.set(0, 1.45 * scale, z)
      spike.rotation.x = -0.6
      group.add(spike)
      details.push(spike)
    }
    weakPoint = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 5, 10), glow)
    weakPoint.rotation.x = Math.PI / 2 - 0.5
    weakPoint.position.set(0, 1.3 * scale, 0.12)
    group.add(weakPoint)
  } else if (kind === 'brute') {
    weakPoint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 2), glow)
    weakPoint.position.set(0, 1.25 * scale, -0.31 * scale)
    group.add(weakPoint)
    const hammer = new THREE.Mesh(new RoundedBoxGeometry(0.18, 1.25, 0.18, 3, 0.035), armor)
    hammer.position.set(0, -0.65, 0)
    rightArm.add(hammer)
    const hammerHead = new THREE.Mesh(new RoundedBoxGeometry(0.65, 0.3, 0.35, 3, 0.05), armor)
    hammerHead.position.y = -0.65
    hammer.add(hammerHead)
  } else {
    weakPoint = new THREE.Mesh(new THREE.SphereGeometry(0.24 * scale, 12, 10), glow)
    weakPoint.position.copy(head.position)
    weakPoint.visible = false
    group.add(weakPoint)
  }

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(width * 0.55, width * 0.68, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: soldier ? 0.2 : 0.1, side: THREE.DoubleSide }),
  )
  floorRing.rotation.x = -Math.PI / 2
  floorRing.position.y = 0.02
  group.add(floorRing)
  details.push(floorRing)

  if (kind === 'stalker') {
    // L'Ombra sfuma quasi invisibile da lontano: tutti i materiali devono poter essere trasparenti.
    const fade: THREE.Material[] = []
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (fade.includes(material)) continue
        material.transparent = true
        fade.push(material)
      }
    })
    group.userData.fadeMaterials = fade
  }

  return { group, body, head, leftLeg, rightLeg, leftArm, rightArm, weakPoint, details, height }
}
