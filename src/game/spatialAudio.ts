export interface AudioPosition {
  x: number
  z: number
}

export interface SpatialSound {
  pan: number
  volume: number
}

export function getSpatialSound(source: AudioPosition, listener: AudioPosition, yaw: number): SpatialSound {
  const dx = source.x - listener.x
  const dz = source.z - listener.z
  const distance = Math.sqrt(dx * dx + dz * dz)
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  return {
    pan: distance > 0.001 ? Math.max(-1, Math.min(1, right / distance)) : 0,
    volume: Math.max(0.08, 1 / (1 + distance * 0.1)),
  }
}
