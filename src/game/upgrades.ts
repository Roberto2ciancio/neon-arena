import type { MetaBonuses, PlayerStats } from './types'

export interface UpgradeDefinition {
  id: string
  name: string
  description: string
  icon: string
  tag: string
  rarity?: 'rare'
  isAvailable: (stats: PlayerStats) => boolean
  apply: (stats: PlayerStats) => void
}

const always = () => true

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: 'damage',
    name: 'SOVRACCARICO',
    description: '+20% danno dei proiettili.',
    icon: '⌁',
    tag: 'ATTACCO',
    isAvailable: always,
    apply: (stats) => { stats.damage *= 1.2 },
  },
  {
    id: 'fire-rate',
    name: 'GRILLETTO VELOCE',
    description: '+18% cadenza di fuoco.',
    icon: '≋',
    tag: 'ATTACCO',
    isAvailable: always,
    apply: (stats) => { stats.fireRate *= 1.18 },
  },
  {
    id: 'multishot',
    name: 'ECO BALLISTICO',
    description: '+1 colpo hitscan per raffica. Massimo 5.',
    icon: '⋔',
    tag: 'ATTACCO // RARO',
    rarity: 'rare',
    isAvailable: (stats) => stats.projectileCount < 5,
    apply: (stats) => { stats.projectileCount += 1 },
  },
  {
    id: 'pierce',
    name: 'PERFORAZIONE',
    description: 'I proiettili attraversano +1 nemico.',
    icon: '⇥',
    tag: 'ATTACCO // RARO',
    rarity: 'rare',
    isAvailable: (stats) => stats.pierce < 4,
    apply: (stats) => { stats.pierce += 1 },
  },
  {
    id: 'critical',
    name: 'PUNTO DEBOLE',
    description: '+10% probabilità di colpo critico.',
    icon: '◎',
    tag: 'ATTACCO',
    isAvailable: (stats) => stats.critChance < 0.65,
    apply: (stats) => { stats.critChance += 0.1 },
  },
  {
    id: 'incendiary',
    name: 'MUNIZIONI INCENDIARIE',
    description: 'I colpi infiammano per 3 secondi. +20% danno base al secondo per livello.',
    icon: '♨',
    tag: 'EFFETTO // RARO // MAX 3',
    rarity: 'rare',
    isAvailable: (stats) => stats.incendiary < 3,
    apply: (stats) => { stats.incendiary += 1 },
  },
  {
    id: 'headshot-explosion',
    name: 'NUCLEO INSTABILE',
    description: 'Le headshot esplodono e feriscono i nemici vicini. Richiede Munizioni incendiarie.',
    icon: '✺',
    tag: 'EFFETTO // RARO // MAX 3',
    rarity: 'rare',
    isAvailable: (stats) => stats.incendiary > 0 && stats.headshotExplosion < 3,
    apply: (stats) => { stats.headshotExplosion += 1 },
  },
  {
    id: 'chain-lightning',
    name: 'ARCO VOLTAICO',
    description: 'I colpi critici colpiscono nemici vicini. Richiede Punto debole.',
    icon: 'ϟ',
    tag: 'EFFETTO // RARO // MAX 3',
    rarity: 'rare',
    isAvailable: (stats) => stats.critChance >= 0.15 && stats.chainLightning < 3,
    apply: (stats) => { stats.chainLightning += 1 },
  },
  {
    id: 'vitality',
    name: 'CORAZZA REATTIVA',
    description: '+25 integrità massima e recupero immediato.',
    icon: '⬡',
    tag: 'DIFESA',
    isAvailable: always,
    apply: (stats) => { stats.maxHealth += 25 },
  },
  {
    id: 'regeneration',
    name: 'NANORIPARAZIONE',
    description: 'Rigenera 0,8 integrità al secondo.',
    icon: '✚',
    tag: 'DIFESA',
    isAvailable: always,
    apply: (stats) => { stats.regen += 0.8 },
  },
  {
    id: 'armor',
    name: 'SCUDO CINETICO',
    description: '-2 danni subiti da ogni attacco.',
    icon: '▣',
    tag: 'DIFESA',
    isAvailable: (stats) => stats.armor < 12,
    apply: (stats) => { stats.armor += 2 },
  },
  {
    id: 'speed',
    name: 'PROPULSORI',
    description: '+12% velocità di movimento.',
    icon: '»',
    tag: 'MOBILITÀ',
    isAvailable: always,
    apply: (stats) => { stats.speed *= 1.12 },
  },
  {
    id: 'magnet',
    name: 'CAMPO DI RACCOLTA',
    description: '+2 metri di attrazione dei frammenti.',
    icon: '◈',
    tag: 'UTILITÀ',
    isAvailable: always,
    apply: (stats) => { stats.magnetRadius += 2 },
  },
]

export const FIRST_LEVEL_XP = 90
export const LEVEL_XP_GROWTH = 1.45
export const UPGRADE_KEYS: readonly string[] = ['KeyZ', 'KeyX', 'KeyV']

export function getNextLevelXp(current: number): number {
  return Math.floor(current * LEVEL_XP_GROWTH)
}

export const UPGRADE_BY_ID = new Map(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, upgrade]))

export function createBaseStats(bonuses: MetaBonuses = { vitality: 0, power: 0, mobility: 0 }): PlayerStats {
  return {
    maxHealth: 100 + bonuses.vitality * 10,
    speed: 7.4 * (1 + bonuses.mobility * 0.03),
    damage: 20 * (1 + bonuses.power * 0.05),
    fireRate: 8.5,
    projectileCount: 1,
    pierce: 0,
    critChance: 0.05,
    critMultiplier: 2,
    magnetRadius: 2.6,
    armor: 0,
    regen: 0,
    incendiary: 0,
    headshotExplosion: 0,
    chainLightning: 0,
  }
}

export function getUpgradeChoices(stats: PlayerStats, random: () => number = Math.random, count = 3): UpgradeDefinition[] {
  const pool = UPGRADE_DEFINITIONS.filter((upgrade) => upgrade.isAvailable(stats))
  const choices: UpgradeDefinition[] = []

  while (pool.length > 0 && choices.length < count) {
    const totalWeight = pool.reduce((sum, upgrade) => sum + (upgrade.rarity === 'rare' ? 0.35 : 1), 0)
    let roll = Math.min(0.999999999, Math.max(0, random())) * totalWeight
    let index = pool.length - 1
    for (let candidate = 0; candidate < pool.length; candidate += 1) {
      const upgrade = pool[candidate]
      if (!upgrade) continue
      roll -= upgrade.rarity === 'rare' ? 0.35 : 1
      if (roll < 0) {
        index = candidate
        break
      }
    }
    const [choice] = pool.splice(index, 1)
    if (choice) choices.push(choice)
  }

  return choices
}

export function applyUpgrade(stats: PlayerStats, upgradeId: string): PlayerStats {
  const upgrade = UPGRADE_BY_ID.get(upgradeId)
  if (!upgrade) throw new Error(`Potenziamento sconosciuto: ${upgradeId}`)

  const nextStats = { ...stats }
  upgrade.apply(nextStats)
  return nextStats
}
