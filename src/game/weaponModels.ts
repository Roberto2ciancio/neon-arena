import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { AttachmentSelection } from './attachments'
import type { CamoId } from './cosmetics'
import type { WeaponModel } from './models'
import type { MeleeId, WeaponCategory, WeaponDefinition } from './weapons'

/** Proporzioni del modello per categoria (metri, asse -z in avanti). */
interface Shape {
  receiver: number
  height: number
  barrel: number
  barrelRadius: number
  stock: 'full' | 'short' | 'none' | 'skeleton'
  magazine: 'straight' | 'curved' | 'box' | 'drum' | 'none' | 'pistol' | 'cylinder'
  handguard: number
  pistol: boolean
}

const SHAPES: Record<WeaponCategory, Shape> = {
  assault: { receiver: 0.72, height: 0.2, barrel: 0.42, barrelRadius: 0.023, stock: 'full', magazine: 'straight', handguard: 0.5, pistol: false },
  smg: { receiver: 0.5, height: 0.19, barrel: 0.2, barrelRadius: 0.02, stock: 'short', magazine: 'straight', handguard: 0.24, pistol: false },
  shotgun: { receiver: 0.58, height: 0.2, barrel: 0.62, barrelRadius: 0.032, stock: 'full', magazine: 'none', handguard: 0.36, pistol: false },
  sniper: { receiver: 0.82, height: 0.19, barrel: 0.78, barrelRadius: 0.02, stock: 'skeleton', magazine: 'box', handguard: 0.55, pistol: false },
  lmg: { receiver: 0.86, height: 0.26, barrel: 0.6, barrelRadius: 0.028, stock: 'full', magazine: 'drum', handguard: 0.5, pistol: false },
  pistol: { receiver: 0.32, height: 0.13, barrel: 0.04, barrelRadius: 0.016, stock: 'none', magazine: 'pistol', handguard: 0, pistol: true },
  'machine-pistol': { receiver: 0.34, height: 0.14, barrel: 0.08, barrelRadius: 0.017, stock: 'none', magazine: 'pistol', handguard: 0, pistol: true },
}

const camoCache = new Map<CamoId, THREE.CanvasTexture>()

/** Texture procedurale della mimetica (null per la finitura standard e per l'oro). */
export function getCamoTexture(camo: CamoId): THREE.CanvasTexture | null {
  if (camo === 'standard' || camo === 'gold') return null
  const cached = camoCache.get(camo)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  let seed = camo.length * 7919
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  if (context) {
    if (camo === 'urban') {
      context.fillStyle = '#6d7378'
      context.fillRect(0, 0, 128, 128)
      for (const color of ['#3d4245', '#9aa1a6', '#2a2d30']) {
        for (let index = 0; index < 9; index += 1) {
          context.fillStyle = color
          context.beginPath()
          context.ellipse(random() * 128, random() * 128, 8 + random() * 16, 5 + random() * 10, random() * Math.PI, 0, Math.PI * 2)
          context.fill()
        }
      }
    } else if (camo === 'digital') {
      context.fillStyle = '#56603f'
      context.fillRect(0, 0, 128, 128)
      const colors = ['#3a4229', '#7c7350', '#2b2f20', '#8f8a62']
      for (let index = 0; index < 220; index += 1) {
        context.fillStyle = colors[Math.floor(random() * colors.length)]!
        const size = random() > 0.7 ? 8 : 4
        context.fillRect(Math.floor(random() * 32) * 4, Math.floor(random() * 32) * 4, size, size)
      }
    } else if (camo === 'tiger') {
      context.fillStyle = '#c47a2c'
      context.fillRect(0, 0, 128, 128)
      context.fillStyle = '#1b1410'
      for (let index = 0; index < 11; index += 1) {
        const y = index * 12 + random() * 6
        context.beginPath()
        context.moveTo(0, y)
        for (let x = 0; x <= 128; x += 16) context.lineTo(x, y + Math.sin(x * 0.08 + index) * 5 + random() * 3)
        context.lineTo(128, y + 5)
        for (let x = 128; x >= 0; x -= 16) context.lineTo(x, y + 5 + Math.sin(x * 0.1 + index) * 2)
        context.fill()
      }
    } else if (camo === 'carbon') {
      context.fillStyle = '#16181b'
      context.fillRect(0, 0, 128, 128)
      for (let x = 0; x < 128; x += 8) {
        for (let y = 0; y < 128; y += 8) {
          context.fillStyle = (x + y) % 16 === 0 ? '#2b2f34' : '#202327'
          context.fillRect(x, y, 8, 4)
          context.fillStyle = (x + y) % 16 === 0 ? '#202327' : '#2b2f34'
          context.fillRect(x, y + 4, 8, 4)
        }
      }
    } else if (camo === 'neon') {
      const gradient = context.createLinearGradient(0, 0, 128, 128)
      gradient.addColorStop(0, '#0a2d3a')
      gradient.addColorStop(0.5, '#3a0f45')
      gradient.addColorStop(1, '#0a2d3a')
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
      context.strokeStyle = '#58f5e5'
      context.lineWidth = 2
      for (let index = 0; index < 8; index += 1) {
        context.beginPath()
        context.moveTo(random() * 128, 0)
        context.lineTo(random() * 128, 128)
        context.stroke()
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  camoCache.set(camo, texture)
  return texture
}

function createBodyMaterial(camo: CamoId): THREE.MeshStandardMaterial {
  if (camo === 'gold') return new THREE.MeshStandardMaterial({ color: 0xd4a441, metalness: 1, roughness: 0.22 })
  const map = getCamoTexture(camo)
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : 0x3f4851,
    map,
    metalness: map ? 0.45 : 0.92,
    roughness: map ? 0.55 : 0.27,
    emissive: camo === 'neon' ? 0x0b2a30 : 0x000000,
    emissiveIntensity: camo === 'neon' ? 0.6 : 0,
  })
}

export interface ViewWeaponOptions {
  camo?: CamoId
  gloveColor?: number
  /** Mani visibili (prima persona) oppure solo l'arma (anteprima, terza persona). */
  hands?: boolean
}

/** Arma in prima persona generata per categoria, con accessori e mimetica. */
export function createViewWeapon(weapon: WeaponDefinition, attachments: AttachmentSelection = {}, options: ViewWeaponOptions = {}): WeaponModel {
  const shape = SHAPES[weapon.category]
  const group = new THREE.Group()
  const body = createBodyMaterial(options.camo ?? 'standard')
  const dark = new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.35, roughness: 0.58 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: 0.9, roughness: 0.3 })
  const accent = new THREE.MeshStandardMaterial({ color: 0x4debd9, emissive: 0x20aa9e, emissiveIntensity: 0.65, metalness: 0.5, roughness: 0.3 })
  const glove = new THREE.MeshStandardMaterial({ color: options.gloveColor ?? 0x181a1d, roughness: 0.93 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotationX = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.rotation.x = rotationX
    group.add(mesh)
    return mesh
  }
  const barrelExtra = attachments.barrel === 'long-barrel' ? 0.2 : attachments.barrel === 'short-barrel' ? -0.1 : 0
  const receiverFront = shape.pistol ? -shape.receiver : -0.28 - shape.receiver / 2
  let muzzleZ: number

  if (shape.pistol) {
    // Carrello, fusto e impugnatura.
    add(new RoundedBoxGeometry(0.1, shape.height * 0.6, shape.receiver, 3, 0.02), body, 0, 0.03, -shape.receiver / 2)
    add(new RoundedBoxGeometry(0.095, shape.height * 0.45, shape.receiver * 0.9, 2, 0.015), dark, 0, -0.035, -shape.receiver / 2 + 0.01)
    add(new RoundedBoxGeometry(0.085, 0.22, 0.11, 3, 0.02), dark, 0, -0.14, 0.02, -0.22)
    if (weapon.id === 'r-44') {
      const cylinder = add(new THREE.CylinderGeometry(0.055, 0.055, 0.11, 8), metal, 0, 0, -0.12)
      cylinder.rotation.x = Math.PI / 2
    }
    const barrelLength = Math.max(0.04, shape.barrel + barrelExtra + (weapon.id === 'r-44' ? 0.14 : 0))
    add(new THREE.CylinderGeometry(shape.barrelRadius, shape.barrelRadius, barrelLength, 12), metal, 0, 0.035, receiverFront - barrelLength / 2, Math.PI / 2)
    muzzleZ = receiverFront - barrelLength
    if (weapon.category === 'machine-pistol') add(new RoundedBoxGeometry(0.05, 0.1, 0.05, 2, 0.01), dark, 0, -0.07, -0.26, 0.2)
    add(new THREE.BoxGeometry(0.02, 0.025, 0.02), accent, 0, 0.085, -shape.receiver + 0.03)
  } else {
    add(new RoundedBoxGeometry(0.18, shape.height, shape.receiver, 3, 0.025), body, 0, 0, -0.28)
    if (shape.handguard > 0) add(new RoundedBoxGeometry(0.15, shape.height * 0.75, shape.handguard, 3, 0.018), weapon.category === 'shotgun' ? body : dark, 0, weapon.category === 'shotgun' ? -0.06 : 0.015, receiverFront - shape.handguard / 2 + 0.08)
    const barrelLength = shape.barrel + barrelExtra
    const barrelStart = receiverFront - (shape.handguard > 0 ? shape.handguard - 0.12 : 0)
    add(new THREE.CylinderGeometry(shape.barrelRadius, shape.barrelRadius, barrelLength, 14), metal, 0, 0.035, barrelStart - barrelLength / 2, Math.PI / 2)
    muzzleZ = barrelStart - barrelLength
    if (weapon.category === 'shotgun') add(new THREE.CylinderGeometry(0.024, 0.024, barrelLength * 0.8, 12), metal, 0, -0.03, barrelStart - barrelLength * 0.4, Math.PI / 2)
    if (weapon.category === 'lmg') {
      add(new THREE.CylinderGeometry(0.05, 0.05, barrelLength * 0.6, 10, 1, true), dark, 0, 0.035, barrelStart - barrelLength * 0.3, Math.PI / 2)
      for (const side of [-1, 1]) {
        const leg = add(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), metal, side * 0.05, -0.12, muzzleZ + 0.18)
        leg.rotation.z = side * 0.35
      }
    }
    // Calcio.
    if (shape.stock === 'full') add(new RoundedBoxGeometry(0.16, 0.2, 0.38, 3, 0.025), dark, 0, -0.025, 0.25, -0.12)
    if (shape.stock === 'short') add(new RoundedBoxGeometry(0.1, 0.12, 0.22, 2, 0.02), dark, 0, -0.01, 0.12)
    if (shape.stock === 'skeleton') {
      add(new RoundedBoxGeometry(0.06, 0.05, 0.42, 2, 0.015), dark, 0, 0.02, 0.27)
      add(new RoundedBoxGeometry(0.06, 0.05, 0.42, 2, 0.015), dark, 0, -0.1, 0.27, -0.18)
      add(new RoundedBoxGeometry(0.08, 0.2, 0.06, 2, 0.015), dark, 0, -0.05, 0.46)
    }
    add(new RoundedBoxGeometry(0.12, 0.3, 0.15, 3, 0.025), dark, 0, -0.22, -0.12, -0.25)
    add(new THREE.BoxGeometry(0.09, 0.025, shape.receiver * 0.9), dark, 0, shape.height / 2 + 0.02, -0.28)
    add(new THREE.BoxGeometry(0.185, 0.025, shape.receiver * 0.35), accent, 0, shape.height / 2 - 0.005, -0.28 - shape.receiver * 0.2)
  }

  // Caricatore.
  const extended = attachments.magazine === 'extended-mag'
  const magScale = extended ? 1.45 : 1
  const magZ = shape.pistol ? 0.02 : -0.42
  if (shape.magazine === 'straight' || shape.magazine === 'curved') {
    const curve = weapon.id === 'ak-74r' ? 0.32 : 0.14
    add(new RoundedBoxGeometry(0.13, 0.32 * magScale, 0.2, 3, 0.018), body, 0, -0.18 - 0.16 * magScale + 0.1, magZ, curve)
    if (attachments.magazine === 'fast-mag') add(new RoundedBoxGeometry(0.13, 0.32, 0.2, 3, 0.018), body, 0.14, -0.24, magZ, curve)
  } else if (shape.magazine === 'box') {
    add(new RoundedBoxGeometry(0.11, 0.16 * magScale, 0.18, 3, 0.016), dark, 0, -0.16 - 0.04 * magScale, magZ)
  } else if (shape.magazine === 'drum') {
    const drum = add(new THREE.CylinderGeometry(0.16 * Math.sqrt(magScale), 0.16 * Math.sqrt(magScale), 0.12, 16), dark, 0, -0.22, magZ)
    drum.rotation.z = Math.PI / 2
  } else if (shape.magazine === 'pistol' && extended) {
    add(new RoundedBoxGeometry(0.075, 0.12, 0.08, 2, 0.015), dark, 0, -0.29, 0.06, -0.22)
  }

  // Ottiche.
  const opticY = shape.pistol ? 0.1 : shape.height / 2 + 0.07
  const opticZ = shape.pistol ? -0.12 : -0.32
  const lens = new THREE.MeshStandardMaterial({ color: 0x0f2a33, metalness: 0.8, roughness: 0.05, emissive: 0x0a2830, emissiveIntensity: 0.4 })
  const builtInScope = weapon.id === 'sr-50'
  if (attachments.optic === 'scope-4x' || builtInScope) {
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 16), metal, 0, opticY + 0.03, opticZ, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.058, 0.045, 0.08, 16), metal, 0, opticY + 0.03, opticZ - 0.24, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.01, 16), lens, 0, opticY + 0.03, opticZ - 0.285, Math.PI / 2)
    add(new THREE.BoxGeometry(0.04, 0.06, 0.04), dark, 0, opticY - 0.02, opticZ - 0.1)
    add(new THREE.BoxGeometry(0.04, 0.06, 0.04), dark, 0, opticY - 0.02, opticZ + 0.1)
  } else if (attachments.optic === 'holo') {
    add(new RoundedBoxGeometry(0.1, 0.035, 0.16, 2, 0.01), dark, 0, opticY - 0.03, opticZ)
    add(new THREE.BoxGeometry(0.1, 0.09, 0.012), dark, 0, opticY + 0.02, opticZ - 0.07)
    add(new THREE.BoxGeometry(0.075, 0.06, 0.004), lens, 0, opticY + 0.02, opticZ - 0.065)
    add(new THREE.RingGeometry(0.012, 0.016, 16), new THREE.MeshBasicMaterial({ color: 0xff4f87 }), 0, opticY + 0.02, opticZ - 0.06)
  } else if (attachments.optic === 'red-dot') {
    add(new RoundedBoxGeometry(0.07, 0.03, 0.09, 2, 0.01), dark, 0, opticY - 0.035, opticZ)
    add(new THREE.TorusGeometry(0.035, 0.007, 8, 20), dark, 0, opticY + 0.005, opticZ)
    add(new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, opticY + 0.005, opticZ - 0.01)
  } else if (!shape.pistol) {
    add(new THREE.TorusGeometry(0.055, 0.008, 8, 24), dark, 0, opticY, opticZ)
    add(new THREE.SphereGeometry(0.009, 8, 8), accent, 0, opticY, opticZ - 0.095)
  }

  // Sottocanna.
  if (attachments.underbarrel === 'vertical-grip') add(new RoundedBoxGeometry(0.06, 0.16, 0.07, 2, 0.015), dark, 0, -0.14, muzzleZ * 0.55)
  if (attachments.underbarrel === 'laser') {
    add(new RoundedBoxGeometry(0.05, 0.05, 0.11, 2, 0.01), dark, 0.07, -0.04, muzzleZ * 0.6)
    add(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 0.07, -0.04, muzzleZ * 0.6 - 0.06)
  }

  // Bocca.
  if (attachments.muzzle === 'suppressor') {
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 14), dark, 0, 0.035, muzzleZ - 0.15, Math.PI / 2)
    muzzleZ -= 0.3
  } else if (attachments.muzzle === 'compensator') {
    add(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 8), metal, 0, 0.035, muzzleZ - 0.06, Math.PI / 2)
    muzzleZ -= 0.12
  } else if (attachments.muzzle === 'flash-hider') {
    add(new THREE.CylinderGeometry(0.036, 0.026, 0.1, 6), metal, 0, 0.035, muzzleZ - 0.05, Math.PI / 2)
    muzzleZ -= 0.1
  } else if (!shape.pistol) {
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.1, 12), metal, 0, 0.035, muzzleZ - 0.05, Math.PI / 2)
    muzzleZ -= 0.1
  }

  if (options.hands !== false) {
    add(new RoundedBoxGeometry(0.16, 0.15, 0.22, 3, 0.045), glove, 0.03, shape.pistol ? -0.15 : -0.19, shape.pistol ? 0.04 : -0.05)
    add(new RoundedBoxGeometry(0.17, 0.14, 0.24, 3, 0.045), glove, shape.pistol ? -0.06 : -0.02, shape.pistol ? -0.17 : -0.1, shape.pistol ? 0.08 : receiverFront - 0.1)
  }

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.035, muzzleZ - 0.01)
  group.add(muzzle)
  const flash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13),
    new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0.9 }),
  )
  flash.scale.set(0.7, 0.7, 2.5)
  if (attachments.muzzle === 'suppressor') flash.scale.multiplyScalar(0.35)
  flash.visible = false
  flash.add(new THREE.PointLight(0xffa34d, attachments.muzzle === 'suppressor' ? 2 : 7, 3))
  muzzle.add(flash)
  group.visible = false
  return { group, muzzle, flash }
}

/** Arma bianca in prima persona. */
export function createMeleeView(id: MeleeId, gloveColor = 0x181a1d): THREE.Group {
  const group = new THREE.Group()
  const glove = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.93 })
  const handle = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.8 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8d0d6, metalness: 1, roughness: 0.18 })
  const hand = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.15, 0.2, 3, 0.045), glove)
  hand.position.set(0, -0.08, 0)
  group.add(hand)
  // L'arma è tenuta inclinata verso l'alto e di lato, così la lama resta visibile.
  const blade3d = new THREE.Group()
  blade3d.position.set(0, -0.02, -0.04)
  blade3d.rotation.set(1.05, 0.35, -0.45)
  group.add(blade3d)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.16, 10), handle)
  grip.rotation.x = Math.PI / 2
  blade3d.add(grip)
  const length = id === 'machete' ? 0.62 : id === 'plasma' ? 0.55 : 0.28
  const width = id === 'machete' ? 0.07 : 0.045
  const bladeMaterial = id === 'plasma'
    ? new THREE.MeshStandardMaterial({ color: 0x9ffcff, emissive: 0x2ee8ff, emissiveIntensity: 2.4, transparent: true, opacity: 0.85 })
    : steel
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, width, length), bladeMaterial)
  blade.position.set(0, 0, -0.09 - length / 2)
  blade3d.add(blade)
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.025), handle)
  guard.position.set(0, 0, -0.085)
  blade3d.add(guard)
  if (id === 'plasma') {
    const light = new THREE.PointLight(0x2ee8ff, 2.5, 2)
    light.position.copy(blade.position)
    blade3d.add(light)
  }
  group.visible = false
  return group
}
