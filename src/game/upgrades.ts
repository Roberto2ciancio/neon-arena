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
    description: '+12% danno dei proiettili (massimo +60%).',
    icon: '⌁',
    tag: 'ATTACCO',
    isAvailable: (stats) => stats.damage < 20 * 1.6 * META_DAMAGE_CEILING,
    apply: (stats) => { stats.damage *= 1.12 },
  },
  {
    id: 'fire-rate',
    name: 'GRILLETTO VELOCE',
    description: '+10% cadenza di fuoco (massimo +50%).',
    icon: '≋',
    tag: 'ATTACCO',
    isAvailable: (stats) => stats.fireRate < 8.5 * 1.5,
    apply: (stats) => { stats.fireRate *= 1.1 },
  },
  {
    id: 'multishot',
    name: 'ECO BALLISTICO',
    description: '+1 colpo per sparo, ciascuno al 60% del danno. Massimo 3.',
    icon: '⋔',
    tag: 'ATTACCO // RARO',
    rarity: 'rare',
    isAvailable: (stats) => stats.projectileCount < 3,
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
    description: '+8% probabilità di colpo critico (massimo 40%).',
    icon: '◎',
    tag: 'ATTACCO',
    isAvailable: (stats) => stats.critChance < 0.4,
    apply: (stats) => { stats.critChance = Math.min(0.4, stats.critChance + 0.08) },
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
    isAvailable: (stats) => stats.critChance >= 0.13 && stats.chainLightning < 3,
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
  {
    id: 'quick-reload',
    tag: 'UTILITÀ',
    name: 'RICARICA LAMPO',
    description: 'Ricarica il 12% più veloce (massimo 3 volte).',
    icon: '↻',
    isAvailable: (stats) => stats.reloadTime > 0.7,
    apply: (stats) => { stats.reloadTime *= 0.88 },
  },
  {
    id: 'lifesteal',
    tag: 'DIFESA',
    name: 'VAMPIRISMO',
    description: '+3 integrità per ogni uccisione (massimo 3 volte).',
    icon: '♥',
    isAvailable: (stats) => stats.lifesteal < 9,
    apply: (stats) => { stats.lifesteal += 3 },
  },
  {
    id: 'adrenaline',
    tag: 'MOBILITÀ',
    name: 'ADRENALINA',
    description: 'Dopo un’uccisione corri il 25% più veloce per 3 secondi.',
    icon: '⚡',
    isAvailable: (stats) => stats.adrenaline === 0,
    apply: (stats) => { stats.adrenaline = 3 },
  },
  {
    id: 'demolition',
    tag: 'UTILITÀ',
    name: 'ESPLOSIVISTA',
    description: 'Equipaggiamenti pronti il 20% prima e danno esplosivo +25% (massimo 2 volte).',
    icon: '✸',
    isAvailable: (stats) => stats.demolition > 0.7,
    apply: (stats) => { stats.demolition *= 0.8 },
  },
  {
    id: 'executioner',
    tag: 'ATTACCO // RARO',
    name: 'ESECUTORE',
    description: '+35% danno contro i nemici sotto il 30% di vita.',
    icon: '☠',
    rarity: 'rare',
    isAvailable: (stats) => stats.executioner === 0,
    apply: (stats) => { stats.executioner = 0.35 },
  },
  {
    id: 'luck',
    tag: 'UTILITÀ',
    name: 'FORTUNA',
    description: 'Bonus e kit medici cadono il 50% più spesso.',
    icon: '✦',
    isAvailable: (stats) => stats.luck === 1,
    apply: (stats) => { stats.luck = 1.5 },
  },
  {
    id: 'second-wind',
    tag: 'DIFESA // RARO',
    name: 'SECONDO RESPIRO',
    description: 'Una volta per run sopravvivi a un colpo letale con 1 di integrità e 2 secondi di invulnerabilità.',
    icon: '✚',
    rarity: 'rare',
    isAvailable: (stats) => stats.secondWind === 0,
    apply: (stats) => { stats.secondWind = 1 },
  },
  {
    id: 'energy-shield',
    tag: 'DIFESA // RARO',
    name: 'SCUDO ENERGETICO',
    description: 'Uno scudo assorbe 25 danni e si ricarica dopo 5 secondi senza colpi (massimo 2 volte).',
    icon: '◈',
    rarity: 'rare',
    isAvailable: (stats) => stats.energyShield < 50,
    apply: (stats) => { stats.energyShield += 25 },
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
    maxHealth: 100 + bonuses.vitality * META_VITALITY_PER_LEVEL,
    speed: 7.4 * (1 + bonuses.mobility * META_MOBILITY_PER_LEVEL),
    damage: 20 * (1 + bonuses.power * META_POWER_PER_LEVEL),
    fireRate: 8.5,
    projectileCount: 1,
    pierce: 0,
    critChance: 0.05,
    critMultiplier: 1.75,
    magnetRadius: 2.6,
    armor: 0,
    regen: 0,
    incendiary: 0,
    headshotExplosion: 0,
    chainLightning: 0,
    reloadTime: 1,
    lifesteal: 0,
    adrenaline: 0,
    demolition: 1,
    executioner: 0,
    luck: 1,
    secondWind: 0,
    energyShield: 0,
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

/** Officina: ogni livello conta meno di prima (vedi Fase di bilanciamento). */
export const META_VITALITY_PER_LEVEL = 6
export const META_POWER_PER_LEVEL = 0.03
export const META_MOBILITY_PER_LEVEL = 0.02
/** Il tetto di Sovraccarico tiene conto del bonus massimo dell'officina (5 livelli). */
const META_DAMAGE_CEILING = 1 + 5 * META_POWER_PER_LEVEL
/** I colpi aggiuntivi di Colpo multiplo infliggono questa quota del danno. */
export const EXTRA_PROJECTILE_DAMAGE = 0.6
