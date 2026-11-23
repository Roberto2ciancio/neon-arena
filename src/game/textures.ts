import * as THREE from 'three'

export interface IndustrialMaterialMaps {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

function configureTexture(canvas: HTMLCanvasElement, repeat: number, color = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 4
  return texture
}

function createAlbedo(base: string, line: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D non disponibile')
  context.fillStyle = base
  context.fillRect(0, 0, 256, 256)
  let seed = 31
  const random = () => {
    seed = seed * 16807 % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let index = 0; index < 4200; index += 1) {
    const shade = Math.floor(25 + random() * 55)
    context.fillStyle = `rgba(${shade},${shade + 5},${shade + 10},${0.04 + random() * 0.12})`
    const size = random() * 2 + 0.5
    context.fillRect(random() * 256, random() * 256, size, size)
  }
  context.strokeStyle = line
  context.lineWidth = 3
  context.strokeRect(3, 3, 250, 250)
  context.beginPath()
  context.moveTo(0, 128)
  context.lineTo(256, 128)
  context.stroke()
  context.strokeStyle = 'rgba(220, 235, 245, 0.16)'
  context.lineWidth = 0.8
  for (let index = 0; index < 45; index += 1) {
    const x = random() * 256
    const y = random() * 256
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + random() * 45, y + random() * 4)
    context.stroke()
  }
  // Sporco: chiazze scure sfumate, più dense lungo le giunture.
  for (let index = 0; index < 14; index += 1) {
    const x = random() * 256
    const y = index % 2 === 0 ? 128 + (random() - 0.5) * 40 : random() * 256
    const radius = 14 + random() * 34
    const grime = context.createRadialGradient(x, y, 0, x, y, radius)
    grime.addColorStop(0, `rgba(18,14,10,${0.18 + random() * 0.16})`)
    grime.addColorStop(1, 'rgba(18,14,10,0)')
    context.fillStyle = grime
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  // Ruggine: colature dalle giunture e dal bordo superiore.
  for (let index = 0; index < 10; index += 1) {
    const x = random() * 256
    const start = random() > 0.5 ? 4 : 130
    const length = 18 + random() * 60
    const rust = context.createLinearGradient(x, start, x, start + length)
    rust.addColorStop(0, `rgba(122,58,22,${0.35 + random() * 0.25})`)
    rust.addColorStop(1, 'rgba(122,58,22,0)')
    context.fillStyle = rust
    context.fillRect(x, start, 1.5 + random() * 3.5, length)
  }
  // Crepe: spezzate scure e sottili (la mappa di rilievo le trasforma in solchi).
  context.strokeStyle = 'rgba(8,8,10,0.55)'
  for (let index = 0; index < 6; index += 1) {
    let x = random() * 256
    let y = random() * 256
    context.lineWidth = 0.6 + random() * 0.9
    context.beginPath()
    context.moveTo(x, y)
    const segments = 4 + Math.floor(random() * 6)
    for (let segment = 0; segment < segments; segment += 1) {
      x += (random() - 0.5) * 26
      y += (random() - 0.3) * 22
      context.lineTo(x, y)
    }
    context.stroke()
  }
  return canvas
}

function createSurfaceMaps(albedo: HTMLCanvasElement, repeat: number): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const source = albedo.getContext('2d')
  if (!source) throw new Error('Canvas 2D non disponibile')
  const pixels = source.getImageData(0, 0, albedo.width, albedo.height)
  const normalCanvas = document.createElement('canvas')
  const roughnessCanvas = document.createElement('canvas')
  normalCanvas.width = roughnessCanvas.width = albedo.width
  normalCanvas.height = roughnessCanvas.height = albedo.height
  const normalContext = normalCanvas.getContext('2d')
  const roughnessContext = roughnessCanvas.getContext('2d')
  if (!normalContext || !roughnessContext) throw new Error('Canvas 2D non disponibile')
  const normal = normalContext.createImageData(albedo.width, albedo.height)
  const roughness = roughnessContext.createImageData(albedo.width, albedo.height)
  const luminance = (x: number, y: number): number => {
    const wrappedX = (x + albedo.width) % albedo.width
    const wrappedY = (y + albedo.height) % albedo.height
    const index = (wrappedY * albedo.width + wrappedX) * 4
    return ((pixels.data[index] ?? 0) + (pixels.data[index + 1] ?? 0) + (pixels.data[index + 2] ?? 0)) / 765
  }
  for (let y = 0; y < albedo.height; y += 1) {
    for (let x = 0; x < albedo.width; x += 1) {
      const index = (y * albedo.width + x) * 4
      const dx = (luminance(x - 1, y) - luminance(x + 1, y)) * 2.6
      const dy = (luminance(x, y - 1) - luminance(x, y + 1)) * 2.6
      const length = Math.sqrt(dx * dx + dy * dy + 1)
      normal.data[index] = (dx / length * 0.5 + 0.5) * 255
      normal.data[index + 1] = (dy / length * 0.5 + 0.5) * 255
      normal.data[index + 2] = (1 / length * 0.5 + 0.5) * 255
      normal.data[index + 3] = 255
      const rough = Math.round(170 + luminance(x, y) * 70)
      roughness.data[index] = rough
      roughness.data[index + 1] = rough
      roughness.data[index + 2] = rough
      roughness.data[index + 3] = 255
    }
  }
  normalContext.putImageData(normal, 0, 0)
  roughnessContext.putImageData(roughness, 0, 0)
  return {
    normalMap: configureTexture(normalCanvas, repeat),
    roughnessMap: configureTexture(roughnessCanvas, repeat),
  }
}

/** Pelle con macchie, venature e, nelle varianti 1–2, ferite aperte e sangue rappreso. */
export function createOrganicTexture(color: number, variant = 0): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D non disponibile')
  const base = new THREE.Color(color)
  context.fillStyle = `#${base.getHexString()}`
  context.fillRect(0, 0, 128, 128)
  let seed = 73 + variant * 1009
  const random = () => {
    seed = seed * 16807 % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let index = 0; index < 900; index += 1) {
    const dark = random() > 0.6
    context.fillStyle = dark ? `rgba(45,24,20,${random() * 0.16})` : `rgba(215,220,195,${random() * 0.09})`
    const radius = random() * 2.5 + 0.4
    context.beginPath()
    context.arc(random() * 128, random() * 128, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.strokeStyle = 'rgba(54,29,26,0.2)'
  context.lineWidth = 0.7
  for (let index = 0; index < 16; index += 1) {
    const x = random() * 128
    const y = random() * 128
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + random() * 14 - 7, y + random() * 20)
    context.stroke()
  }
  for (let index = 0; index < variant * 2; index += 1) {
    // Ferita: taglio scuro con bordo arrossato e una colatura.
    const x = 16 + random() * 96
    const y = 16 + random() * 96
    const width = 8 + random() * 12
    context.save()
    context.translate(x, y)
    context.rotate(random() * Math.PI)
    context.fillStyle = 'rgba(150,52,48,0.45)'
    context.beginPath()
    context.ellipse(0, 0, width, 4.5, 0, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = 'rgba(50,8,10,0.85)'
    context.beginPath()
    context.ellipse(0, 0, width * 0.75, 1.8, 0, 0, Math.PI * 2)
    context.fill()
    context.restore()
    context.fillStyle = 'rgba(70,10,12,0.5)'
    context.fillRect(x, y, 1.6, 6 + random() * 14)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Tessuto a trama; nelle varianti 1–2 strappi sfilacciati e macchie di sangue. */
export function createFabricTexture(color: number, variant = 0): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D non disponibile')
  context.fillStyle = `#${new THREE.Color(color).getHexString()}`
  context.fillRect(0, 0, 128, 128)
  context.strokeStyle = 'rgba(210,220,220,0.055)'
  context.lineWidth = 1
  for (let line = 0; line < 128; line += 4) {
    context.beginPath()
    context.moveTo(line, 0)
    context.lineTo(line, 128)
    context.stroke()
    context.beginPath()
    context.moveTo(0, line)
    context.lineTo(128, line)
    context.stroke()
  }
  let seed = 97
  for (let index = 0; index < 300; index += 1) {
    seed = seed * 16807 % 2147483647
    const x = (seed - 1) / 2147483646 * 128
    seed = seed * 16807 % 2147483647
    const y = (seed - 1) / 2147483646 * 128
    context.fillStyle = 'rgba(5,7,8,0.09)'
    context.fillRect(x, y, 2, 2)
  }
  const random = () => {
    seed = seed * 16807 % 2147483647
    return (seed - 1) / 2147483646
  }
  seed += variant * 7919
  for (let index = 0; index < variant * 3; index += 1) {
    const x = random() * 128
    const y = random() * 128
    if (index % 2 === 0) {
      // Strappo: buco scuro irregolare con i fili sfilacciati.
      context.fillStyle = 'rgba(4,4,5,0.9)'
      context.beginPath()
      context.moveTo(x, y)
      for (let corner = 0; corner < 6; corner += 1) context.lineTo(x + (random() - 0.5) * 16, y + (random() - 0.5) * 12)
      context.closePath()
      context.fill()
      context.strokeStyle = 'rgba(200,200,190,0.18)'
      context.lineWidth = 0.6
      for (let thread = 0; thread < 5; thread += 1) {
        context.beginPath()
        context.moveTo(x + (random() - 0.5) * 12, y + (random() - 0.5) * 8)
        context.lineTo(x + (random() - 0.5) * 20, y + (random() - 0.5) * 16)
        context.stroke()
      }
    } else {
      // Sangue rappreso.
      const radius = 6 + random() * 12
      const stain = context.createRadialGradient(x, y, 0, x, y, radius)
      stain.addColorStop(0, 'rgba(70,6,10,0.75)')
      stain.addColorStop(1, 'rgba(70,6,10,0)')
      context.fillStyle = stain
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createIndustrialMaterialMaps(base: string, line: string, repeat: number): IndustrialMaterialMaps {
  const albedo = createAlbedo(base, line)
  return {
    map: configureTexture(albedo, repeat, true),
    ...createSurfaceMaps(albedo, repeat),
  }
}
