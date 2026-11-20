import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Impostazioni e callsign stanno nel pannello laterale del menu. */
async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^IMPOSTAZIONI/ }).click()
  await expect(page.locator('#menu-drawer')).toBeVisible()
}

async function closeDrawer(page: Page): Promise<void> {
  await page.locator('#drawer-close').click()
  await expect(page.locator('#menu-drawer')).toBeHidden()
}

test('una run FPS usa mouse, fuoco, mira e ricarica e salva il risultato', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => window.localStorage.setItem('neon-arena:graphics:v1', 'low'))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NEON ARENA' })).toBeVisible()
  await expect(page.locator('#scene canvas:not(.hidden)')).toBeVisible()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#crosshair')).toBeVisible()
  await expect(page.locator('#wave-text')).toHaveText('ONDATA 01')
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')

  await page.keyboard.down('KeyW')
  await page.keyboard.down('ShiftLeft')
  try {
    await expect(page.locator('#door-prompt')).toBeVisible()
  } finally {
    await page.keyboard.up('ShiftLeft')
    await page.keyboard.up('KeyW')
  }
  await expect(page.locator('#door-prompt-text')).toHaveText('APRI PORTA // ⬢ 5')
  await page.keyboard.press('KeyE')
  await expect(page.locator('#door-prompt-text')).toHaveText('SERVONO 5 CREDITI')
  await page.keyboard.press('Space')
  const viewport = page.viewportSize()
  await page.mouse.move((viewport?.width ?? 1440) * 0.6, (viewport?.height ?? 900) * 0.45)
  await page.mouse.down()
  await page.waitForTimeout(450)
  await page.mouse.up()
  await expect(page.locator('#ammo-text')).not.toHaveText('30')

  await page.keyboard.press('KeyR')
  await expect(page.locator('#reload-text')).toHaveText('RICARICA IN CORSO...')
  await expect(page.locator('#ammo-text')).toHaveText('30', { timeout: process.env.CI ? 15000 : 3000 })

  await page.mouse.down({ button: 'right' })
  await expect(page.locator('#crosshair')).toHaveClass(/aiming/)
  await page.mouse.down()
  await page.waitForTimeout(300)
  await page.mouse.up()
  await expect(page.locator('#ammo-text')).not.toHaveText('30')
  await page.mouse.up({ button: 'right' })
  await page.keyboard.press('KeyR')
  await expect(page.locator('#ammo-text')).toHaveText('30', { timeout: process.env.CI ? 15000 : 3000 })

  await page.keyboard.press('Digit2')
  await expect(page.locator('#weapon-name')).toHaveText('P-12 // SEMIAUTOMATICA')
  await expect(page.locator('#ammo-text')).toHaveText('12')
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.up()
  await expect(page.locator('#ammo-text')).toHaveText('11')
  await page.keyboard.press('Digit1')
  await expect(page.locator('#ammo-text')).toHaveText('30')
  // Slot del loadout: primaria, secondaria e arma bianca.
  await expect(page.locator('.weapon-slot.owned')).toHaveCount(3)
  await page.keyboard.press('Digit3')
  await expect(page.locator('#weapon-name')).toHaveText('COLTELLO DA COMBATTIMENTO')
  await expect(page.locator('#ammo-text')).toHaveText('—')
  await page.keyboard.press('Digit2')
  await expect(page.locator('#ammo-text')).toHaveText('11')
  await page.keyboard.press('KeyR')
  await expect(page.locator('#ammo-text')).toHaveText('12', { timeout: process.env.CI ? 15000 : 3000 })

  // Rotella: dalla secondaria in giù si passa all'arma bianca, in su si torna alla secondaria.
  await page.mouse.wheel(0, 120)
  await expect(page.locator('#weapon-name')).toHaveText('COLTELLO DA COMBATTIMENTO')
  await page.waitForTimeout(250)
  await page.mouse.wheel(0, -120)
  await expect(page.locator('#weapon-name')).toHaveText('P-12 // SEMIAUTOMATICA')

  await expect(page.locator('#grenade-status')).toHaveText('PRONTA')
  await page.keyboard.press('KeyG')
  await expect(page.locator('#grenade-status')).toHaveText(/^[1-7]s$/)
  await page.keyboard.press('KeyT')
  await expect(page.locator('#turret-status')).toHaveText(/^1[0-8]s$/)

  await page.keyboard.press('Escape')
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused')
  // Impostazioni dalla pausa: Esc chiude il pannello e la partita resta in pausa.
  await page.getByRole('button', { name: 'IMPOSTAZIONI', exact: true }).click()
  await expect(page.locator('#menu-drawer')).toBeVisible()
  await page.locator('#graphics-quality').selectOption('low')
  await page.locator('#mouse-sensitivity').fill('1.5')
  await expect(page.locator('#sensitivity-value')).toHaveText('1,5×')
  await page.keyboard.press('Escape')
  await expect(page.locator('#menu-drawer')).toBeHidden()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused')
  await page.getByRole('button', { name: 'RIPRENDI' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'TERMINA RUN' }).click()

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'menu')
  await expect(page.locator('#total-runs')).toHaveText('1')
  await expect(page.locator('.leaderboard-row')).toHaveCount(1)
  await expect(page.locator('.leaderboard-row').first()).toContainText('ONDATA 1')
  await page.reload()
  await expect(page.locator('#total-runs')).toHaveText('1')
  await expect(page.locator('.leaderboard-row')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('la modalità TCT online fa giocare due persone nella stessa stanza', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 480, height: 360 } })
  await context.addInitScript(() => {
    window.localStorage.setItem('neon-arena:graphics:v1', 'low')
    window.localStorage.setItem('neon-arena:armory:v1', JSON.stringify({ level: 1, xp: 0, loadout: { primary: 'dmr-3' } }))
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message))

  await host.goto('/?net=local')
  await guest.goto('/?net=local')
  await openSettings(guest)
  await guest.locator('#callsign').fill('nova')
  await guest.locator('#callsign').press('Tab')
  await closeDrawer(guest)
  await expect(guest.locator('#profile-name')).toHaveText('NOVA')

  await host.bringToFront()
  await host.locator('[data-mode="tct"]').click()
  await expect(host.locator('#start-button')).toBeHidden()
  await host.getByRole('button', { name: 'CREA STANZA' }).click()
  await expect(host.locator('#room-code-display')).toHaveText(/^[A-Z2-9]{5}$/)
  await expect(host.locator('#start-match')).toBeDisabled()
  const code = await host.locator('#room-code-display').textContent()

  await guest.bringToFront()
  await guest.locator('[data-mode="tct"]').click()
  await guest.locator('#room-code').fill(code ?? '')
  await guest.getByRole('button', { name: 'ENTRA', exact: true }).click()
  await expect(guest.locator('#team-bravo')).toContainText('NOVA')
  await expect(host.locator('#team-bravo')).toContainText('NOVA')
  await expect(host.locator('#team-alpha')).toContainText('PLAYER')
  await expect(guest.locator('#start-match')).toBeHidden()
  await expect(guest.locator('[data-map="district-zero"]')).toBeDisabled()

  await host.bringToFront()
  await host.locator('[data-map="district-zero"]').click()
  await expect(guest.locator('[data-map="district-zero"]')).toHaveAttribute('aria-pressed', 'true')
  await host.bringToFront()
  await expect(host.locator('#start-match')).toBeVisible()
  await expect(host.locator('#start-match')).toBeEnabled()
  await host.getByRole('button', { name: 'AVVIA PARTITA' }).click()

  for (const page of [host, guest]) {
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
    await expect(page.locator('#map-name')).toHaveText('DISTRETTO ZERO')
    await expect(page.locator('#score-text')).toHaveText('0 : 0')
    await expect(page.locator('#minimap')).toBeVisible()
  }
  await expect(host.locator('#score-label')).toHaveText('ALPHA // AVVERSARI')
  await expect(guest.locator('#score-label')).toHaveText('BRAVO // AVVERSARI')
  await expect(host.locator('#weapon-name')).toHaveText('DMR-3 // PRECISIONE')
  await expect(host.locator('#wave-text')).toHaveText(/^TCT \/\/ [23]:\d\d$/)

  await expect.poll(() => host.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await host.mouse.down()
  await host.waitForTimeout(350)
  await host.mouse.up()
  await expect(host.locator('#ammo-text')).toHaveText('11')
  await host.keyboard.press('Digit2')
  await expect(host.locator('#weapon-name')).toHaveText('P-12 // SEMIAUTOMATICA')
  await host.keyboard.press('KeyG')
  await expect(host.locator('#grenade-status')).toHaveText(/^[1-7]s$/)

  await guest.bringToFront()
  await guest.keyboard.press('Escape')
  await expect(guest.locator('#app')).toHaveAttribute('data-state', 'paused')
  await guest.getByRole('button', { name: 'ESCI DALLA PARTITA' }).click()
  await expect(guest.locator('#app')).toHaveAttribute('data-state', 'menu')
  await expect(guest.locator('#lobby-connect')).toBeVisible()

  await expect(host.locator('#app')).toHaveAttribute('data-state', 'victory')
  await expect(host.locator('#gameover-title')).toHaveText('VITTORIA')
  await host.getByRole('button', { name: 'TORNA ALLA LOBBY' }).click()
  await expect(host.locator('#app')).toHaveAttribute('data-state', 'menu')
  await expect(host.locator('#room-code-display')).toHaveText(code ?? '')
  await expect(host.locator('#team-bravo li')).toHaveCount(0)
  await expect(host.locator('#total-runs')).toHaveText('0')
  expect(errors).toEqual([])
  await context.close()
})

test('l’armeria equipaggia armi, accessori ed equipaggiamenti e li porta in partita', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  // Livello del giocatore 12; l'AK-74R è al livello d'arma 6 (accessori fino al caricatore esteso).
  await page.evaluate(() => {
    window.localStorage.setItem('neon-arena:armory:v1', JSON.stringify({ level: 12, xp: 0, mastery: { 'ak-74r': { level: 6, xp: 0, prestige: 0 } } }))
    window.localStorage.setItem('neon-arena:graphics:v1', 'low')
  })
  await page.reload()
  await expect(page.locator('#player-level')).toHaveText('12')
  await page.getByRole('button', { name: 'ARMERIA' }).click()
  await expect(page.locator('#armory-screen')).toBeVisible()
  await expect(page.locator('#armory-level')).toHaveText('12')
  // Armi bloccate oltre il livello attuale.
  await expect(page.locator('.armory-item', { hasText: 'AS-12' })).toBeDisabled()
  await page.locator('.armory-item', { hasText: 'AK-74R' }).click()
  // Gli accessori si sbloccano con il livello dell'arma, non del giocatore.
  await expect(page.locator('.armory-chip', { hasText: 'OTTICA 4×' })).toBeDisabled()
  await page.locator('.armory-chip', { hasText: 'COMPENSATORE' }).click()
  await page.locator('.armory-chip', { hasText: 'CARICATORE ESTESO' }).click()
  await expect(page.locator('.armory-meta').first()).toContainText('45 COLPI')
  // Al massimo 3 accessori: il quarto viene rifiutato.
  await page.locator('.armory-chip', { hasText: 'PUNTO ROSSO' }).click()
  await page.locator('.armory-chip', { hasText: 'IMPUGNATURA VERTICALE' }).click()
  await expect(page.locator('.armory-hint.error')).toContainText('Massimo 3 accessori')
  await expect(page.locator('.armory-attachment-count')).toContainText('ACCESSORI 3/3')
  await page.locator('[data-armory-tab="secondary"]').click()
  await page.locator('.armory-item', { hasText: 'R-44' }).click()
  await page.locator('[data-armory-tab="melee"]').click()
  await page.locator('.armory-item', { hasText: 'MACHETE' }).click()
  await page.locator('[data-armory-tab="equipment"]').click()
  await page.locator('.armory-item', { hasText: 'SEMTEX' }).click()
  await page.locator('.armory-item', { hasText: 'FUMOGENO' }).click()
  await page.locator('.armory-item', { hasText: 'SCUDO' }).click()
  await page.locator('[data-armory-tab="appearance"]').click()
  await page.locator('.armory-chip', { hasText: 'CAPPUCCIO' }).click()
  await expect(page.locator('.armory-chip.selected', { hasText: 'CAPPUCCIO' })).toBeVisible()
  await page.getByRole('button', { name: 'CHIUDI' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await expect(page.locator('#weapon-name')).toHaveText('AK-74R // PESANTE')
  await expect(page.locator('#ammo-text')).toHaveText('45')
  await expect(page.locator('#lethal-name')).toHaveText('SEMTEX')
  await expect(page.locator('#tactical-name')).toHaveText('FUMOGENO')
  await expect(page.locator('#gadget-name')).toHaveText('SCUDO')
  await page.keyboard.press('Digit2')
  await expect(page.locator('#weapon-name')).toHaveText('R-44 // REVOLVER')
  await page.keyboard.press('Digit3')
  await expect(page.locator('#weapon-name')).toHaveText('MACHETE')
  await page.keyboard.press('KeyQ')
  await expect(page.locator('#tactical-status')).toHaveText(/^\d+s$/)
  await page.keyboard.press('KeyT')
  await expect(page.locator('#turret-status')).toHaveText(/^\d+s$/)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'TERMINA RUN' }).click()
  await expect(page.locator('#gameover-message, #app[data-state="menu"]').first()).toBeAttached()
  expect(errors).toEqual([])
})

test('le armi si potenziano con i frammenti e non hanno munizioni infinite', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.setItem('neon-arena:progress:v1', JSON.stringify({ cores: 20 }))
    window.localStorage.setItem('neon-arena:graphics:v1', 'low')
  })
  await page.reload()
  await page.getByRole('button', { name: 'ARMERIA' }).click()
  await expect(page.locator('.armory-level strong')).toHaveText('POTENZIAMENTO 0/10')
  await page.locator('#weapon-upgrade').click()
  await expect(page.locator('.armory-level strong')).toHaveText('POTENZIAMENTO 1/10')
  await page.locator('#weapon-upgrade').click()
  await expect(page.locator('.armory-level strong')).toHaveText('POTENZIAMENTO 2/10')
  // 8 + 12 frammenti spesi: finiti, il terzo grado (18) non si può comprare.
  await expect(page.locator('#weapon-upgrade')).toBeDisabled()
  await expect(page.locator('#core-balance-side')).toHaveText('0')
  await page.getByRole('button', { name: 'CHIUDI' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await expect(page.locator('#reserve-text')).toHaveText('180')
  expect(errors).toEqual([])
})

test('la modalità Zombie si gioca in squadra ed è più difficile in due', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 480, height: 360 } })
  await context.addInitScript(() => {
    window.localStorage.setItem('neon-arena:graphics:v1', 'low')
    window.localStorage.setItem('neon-arena:welcome:v1', '1')
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message))
  await host.goto('/?net=local')
  await guest.goto('/?net=local')

  await host.bringToFront()
  await host.locator('#coop-lobby summary').click()
  await host.getByRole('button', { name: 'CREA SQUADRA' }).click()
  await expect(host.locator('#coop-code-display')).toHaveText(/^[A-Z2-9]{5}$/)
  await expect(host.locator('#start-button')).toBeHidden()
  const code = await host.locator('#coop-code-display').textContent()

  await guest.bringToFront()
  await guest.locator('#coop-lobby summary').click()
  await guest.locator('#coop-code').fill(code ?? '')
  await guest.locator('#coop-join').click()
  await expect(guest.locator('#coop-players li')).toHaveCount(2)
  await expect(host.locator('#coop-players li')).toHaveCount(2)
  await expect(host.locator('#coop-difficulty')).toContainText('2/4')
  await expect(guest.locator('#coop-start')).toBeHidden()

  await host.bringToFront()
  await host.locator('#coop-start').click()
  for (const page of [host, guest]) await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')

  // In due l'ondata ha il 50% di zombie in più (12 → 18) e gli zombie del compagno arrivano dall'host.
  const hostWave = await host.evaluate(() => {
    const game = (window as any).__neonArena.game
    return { total: game.enemies.length + game.spawnQueue, players: game.coopPlayers }
  })
  expect(hostWave).toEqual({ total: 18, players: 2 })
  await guest.bringToFront()
  await expect.poll(() => guest.evaluate(() => (window as any).__neonArena.game.enemies.length), { timeout: 20000 }).toBeGreaterThan(0)
  await expect(guest.locator('#coop-team li')).toHaveCount(1)

  // Un colpo del compagno viene applicato dallo zombie dell'host.
  // Lo zombie deve essere già emerso dal terreno: durante la risalita è invulnerabile anche in solitaria.
  await host.bringToFront()
  await expect.poll(() => host.evaluate(() => (window as any).__neonArena.game.enemies.find((candidate: any) => candidate.spawnTimer <= 0)?.netId ?? 0), { timeout: 15000 }).toBeGreaterThan(0)
  const target = await host.evaluate(() => (window as any).__neonArena.game.enemies.find((candidate: any) => candidate.spawnTimer <= 0).netId)
  await guest.bringToFront()
  await expect.poll(() => guest.evaluate((id) => {
    const game = (window as any).__neonArena.game
    const enemy = game.enemies.find((candidate: any) => candidate.netId === id)
    if (!enemy) return false
    game.dealDamage(enemy, 5)
    return true
  }, target), { timeout: 10000 }).toBe(true)
  await host.bringToFront()
  await expect.poll(() => host.evaluate((id) => {
    const enemy = (window as any).__neonArena.game.enemies.find((candidate: any) => candidate.netId === id)
    return enemy ? enemy.maxHealth - enemy.health : 5
  }, target), { timeout: 10000 }).toBeGreaterThanOrEqual(5)

  // Il compagno finisce a terra, l'host lo vede e lo rianima.
  await guest.bringToFront()
  await guest.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.invulnerability = 0
    game.damagePlayer(9999)
  })
  await expect(guest.locator('#downed-banner')).toBeVisible()
  await host.bringToFront()
  await expect.poll(() => host.evaluate(() => (window as any).__neonArena.game.teammates.all[0]?.status), { timeout: 10000 }).toBe('down')
  await expect(host.locator('#app')).toHaveAttribute('data-state', 'playing')
  await host.evaluate(() => (window as any).__neonArena.game.applyRevive((window as any).__neonArena.game.teammates.all[0].id, 'host'))
  await guest.bringToFront()
  await expect(guest.locator('#downed-banner')).toBeHidden()
  expect(await guest.evaluate(() => (window as any).__neonArena.game.coopStatus)).toBe('alive')

  // Taglia di squadra: contatore unico dell'host, obiettivo più alto in due, ricompensa a tutti.
  await host.bringToFront()
  const bountyTarget = await host.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.wave += 1
    game.startWaveEvent('bounty')
    game.coop.broadcast({ t: 'wave', wave: game.wave, event: 'bounty' })
    return { target: game.bounty.target, wave: game.wave }
  })
  expect(bountyTarget.target).toBe(Math.round((10 + bountyTarget.wave * 1.2) * 1.5))
  await guest.bringToFront()
  await expect.poll(() => guest.evaluate(() => (window as any).__neonArena.game.bounty?.target ?? 0)).toBe(bountyTarget.target)
  await expect(guest.locator('#event-pill')).toContainText('TAGLIA')
  const killOne = () => host.evaluate(() => {
    const game = (window as any).__neonArena.game
    const victim = game.enemies.find((enemy: any) => enemy.health > 0 && enemy.spawnTimer <= 0)
    if (!victim) return false
    victim.health = 0
    return true
  })
  await host.bringToFront()
  await expect.poll(killOne, { timeout: 15000 }).toBe(true)
  await guest.bringToFront()
  await expect.poll(() => guest.evaluate(() => (window as any).__neonArena.game.bounty?.kills ?? 0)).toBeGreaterThanOrEqual(1)
  const guestCredits = await guest.evaluate(() => (window as any).__neonArena.game.shards)
  await host.bringToFront()
  await host.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.bounty.kills = game.bounty.target - 1
  })
  await expect.poll(killOne, { timeout: 15000 }).toBe(true)
  await guest.bringToFront()
  await expect.poll(() => guest.evaluate(() => (window as any).__neonArena.game.bounty)).toBeNull()
  expect(await guest.evaluate(() => (window as any).__neonArena.game.shards)).toBeGreaterThanOrEqual(guestCredits + 120)
  expect(errors).toEqual([])
  await context.close()
})

test('il TCT online segnala codici stanza non validi o inesistenti', async ({ page }) => {
  await page.goto('/?net=local')
  await page.locator('[data-mode="tct"]').click()
  await page.locator('#room-code').fill('AB')
  await page.getByRole('button', { name: 'ENTRA', exact: true }).click()
  await expect(page.locator('#lobby-status')).toHaveText('Il codice è composto da 5 caratteri.')
  await page.locator('#room-code').fill('ZZZZZ')
  await page.getByRole('button', { name: 'ENTRA', exact: true }).click()
  await expect(page.locator('#lobby-status')).toHaveText('Stanza non trovata. Controlla il codice.')
  await expect(page.locator('#lobby-connect')).toBeVisible()
})

test('le impostazioni di accessibilità sono applicate e persistenti', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSettings(page)
  await page.locator('#reduced-motion').check()
  await page.locator('#high-contrast').check()
  await expect(page.locator('#app')).toHaveClass(/reduced-motion/)
  await expect(page.locator('#app')).toHaveClass(/high-contrast/)
  await page.locator('#mouse-sensitivity').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#mouse-sensitivity')).toHaveValue('1.1')
  await page.reload()
  await expect(page.locator('#reduced-motion')).toBeChecked()
  await expect(page.locator('#high-contrast')).toBeChecked()
  await expect(page.locator('#mouse-sensitivity')).toHaveValue('1.1')
  expect(errors).toEqual([])
})

test('il menu guida le scelte e permette di giocare come ospite', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('#welcome-card')).toBeVisible()
  await expect(page.locator('#profile-kind')).toContainText('OSPITE')
  await page.getByRole('button', { name: 'GIOCA COME OSPITE' }).click()
  await expect(page.locator('#welcome-card')).toBeHidden()
  // Senza Supabase configurato gli account sono dichiarati non disponibili.
  await page.getByRole('button', { name: 'ACCEDI / REGISTRATI' }).click()
  await expect(page.locator('#account-screen')).toBeVisible()
  await expect(page.locator('#account-status')).toContainText('non sono attivi')
  await page.getByRole('button', { name: 'CONTINUA COME OSPITE' }).click()
  await expect(page.locator('#account-screen')).toBeHidden()
  await page.getByRole('button', { name: /^OFFICINA/ }).click()
  await expect(page.locator('#drawer-title')).toHaveText('OFFICINA')
  await expect(page.locator('#meta-upgrades .meta-upgrade')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(page.locator('#menu-drawer')).toBeHidden()
  await page.locator('[data-mode="tct"]').click()
  await expect(page.locator('#play-step')).toHaveText('3 // CREA O ENTRA IN UNA STANZA')
  await page.reload()
  await expect(page.locator('#welcome-card')).toBeHidden()
  expect(errors).toEqual([])
})

test('il profilo locale conserva il callsign senza richiedere Supabase', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('#cloud-status')).toHaveText('LOCALE // OFFLINE')
  await openSettings(page)
  await page.locator('#callsign').fill('nova-07!')
  await page.locator('#callsign').press('Tab')
  await expect(page.locator('#callsign')).toHaveValue('NOVA-07')
  await page.reload()
  await expect(page.locator('#callsign')).toHaveValue('NOVA-07')
  expect(errors).toEqual([])
})

test('il preset grafico viene applicato e conservato', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSettings(page)
  await page.locator('#graphics-quality').selectOption('high')
  await expect(page.locator('#graphics-quality')).toHaveValue('high')
  await closeDrawer(page)
  await page.reload()
  await expect(page.locator('#graphics-quality')).toHaveValue('high')
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/high-quality-gameplay.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'TERMINA RUN' }).click()
  await openSettings(page)
  await page.locator('#graphics-quality').selectOption('low')
  await closeDrawer(page)
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  expect(errors).toEqual([])
})

test('Distretto Zero è giocabile in modalità zombie con prestazioni adeguate', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSettings(page)
  await page.locator('#graphics-quality').selectOption('low')
  await closeDrawer(page)
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#map-name')).toHaveText('DISTRETTO ZERO')
  if (!process.env.CI) await expect.poll(async () => Number.parseInt(await page.locator('#performance-stats').textContent() ?? '0', 10)).toBeGreaterThan(24)
  await expect(page.locator('#performance-stats')).toContainText(/\d+ FPS · \d+ DC/)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'TERMINA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'menu')
  expect(errors).toEqual([])
})

test('Deposito 06 è selezionabile e avvia una run nella nuova mappa', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const depotButton = page.locator('[data-map="depot-06"]')
  await depotButton.click()
  await expect(depotButton).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await expect(page.locator('#map-name')).toHaveText('DEPOSITO 06')
  await expect(page.locator('#wave-text')).toHaveText('ONDATA 01')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'TERMINA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'menu')
  expect(errors).toEqual([])
})


test('un’ondata piena non provoca cali improvvisi di frame', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => window.localStorage.setItem('neon-arena:graphics:v1', 'low'))
  await page.goto('/')
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.clearEntities()
    game.activePowerUps.set('barrier', 999)
    game.wave = 9
    game.nextWave()
    game.debugPlace(0, 0, 12, 0, 0)
  })
  await page.waitForFunction(() => (window as any).__neonArena.game.enemies.length >= 18)
  // Un numero fisso di frame (non un tempo fisso): in CI il rendering software è lento e in
  // 4 secondi si arrivava a 25–27 frame, troppo pochi per il controllo dei picchi.
  const frames = await page.evaluate(async () => new Promise<number[]>((resolve) => {
    const deltas: number[] = []
    let previous = 0
    const frame = (now: number) => {
      if (previous > 0) deltas.push(now - previous)
      previous = now
      if (deltas.length >= 60) resolve(deltas)
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }))
  expect(frames.length).toBe(60)
  // Si misurano i picchi rispetto al frame tipico della stessa macchina, non un valore assoluto:
  // in CI il rendering è software (SwiftShader) e la media sta già intorno ai 40–50 ms.
  // Un picco è un frame oltre il triplo della mediana e oltre 100 ms (blocchi da GC, shader, spawn).
  const sorted = [...frames].sort((first, second) => first - second)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const spikes = frames.filter((duration) => duration > Math.max(100, median * 3))
  expect(spikes.length, `mediana ${Math.round(median)} ms, picchi ${spikes.map(Math.round).join(', ')}`).toBeLessThanOrEqual(Math.max(1, Math.floor(frames.length * 0.02)))
  expect(errors).toEqual([])
})

test('i controlli touch permettono di muoversi, guardare, sparare e mettere in pausa', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 844, height: 390 })
  await page.addInitScript(() => window.localStorage.setItem('neon-arena:graphics:v1', 'low'))
  await page.goto('/?touch=on')
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await expect(page.locator('#touch-controls')).toBeVisible()
  await expect(page.locator('#equipment-hud')).toBeHidden()
  // Niente blocco del puntatore: si gioca con le dita.
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull()

  const read = () => page.evaluate(() => {
    const game = (window as any).__neonArena.game
    return { x: game.controller.position.x as number, z: game.controller.position.z as number, yaw: game.yaw as number }
  })
  const start = await read()

  // Levetta: il pollice parte dove tocca e spinge in avanti.
  await page.mouse.move(170, 270)
  await page.mouse.down()
  await page.mouse.move(170, 190, { steps: 4 })
  await expect.poll(async () => {
    const now = await read()
    return Math.hypot(now.x - start.x, now.z - start.z)
  }).toBeGreaterThan(0.5)
  await page.mouse.up()

  // Visuale: trascinamento nella metà destra.
  const before = (await read()).yaw
  await page.mouse.move(520, 120)
  await page.mouse.down()
  await page.mouse.move(600, 120, { steps: 5 })
  await page.mouse.up()
  expect(Math.abs((await read()).yaw - before)).toBeGreaterThan(0.05)

  // Fuoco: tenendo premuto parte la raffica.
  const fire = await page.locator('.touch-fire').boundingBox()
  expect(fire).not.toBeNull()
  await page.mouse.move(fire!.x + fire!.width / 2, fire!.y + fire!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(450)
  await page.mouse.up()
  await expect(page.locator('#ammo-text')).not.toHaveText('30')

  // Mira con un tocco (si attiva e si disattiva).
  await page.locator('.touch-aim').click()
  await expect(page.locator('#crosshair')).toHaveClass(/aiming/)
  await page.locator('.touch-aim').click()
  await expect(page.locator('#crosshair')).not.toHaveClass(/aiming/)

  await page.locator('.touch-pause').click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused')
  await expect(page.locator('#touch-controls')).toBeHidden()
  expect(errors).toEqual([])
})

test('gli eventi delle ondate cambiano la partita senza cali di frame', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => window.localStorage.setItem('neon-arena:graphics:v1', 'low'))
  await page.goto('/')
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.clearEntities()
    game.activePowerUps.set('barrier', 999)
    game.wave = 7
    game.nextWave()
    game.debugPlace(0, 0, 12, 0, 0)
    game.startWaveEvent('blackout')
  })
  await expect(page.locator('#event-pill')).toContainText('BLACKOUT')
  await expect.poll(() => page.evaluate(() => (window as any).__neonArena.game.lightScale)).toBeLessThan(0.5)

  // Rifornimenti: tre bonus sulla mappa; finito il blackout le luci tornano normali.
  await page.evaluate(() => (window as any).__neonArena.game.startWaveEvent('supply-drop'))
  await expect(page.locator('#event-pill')).toContainText('RIFORNIMENTI')
  expect(await page.evaluate(() => (window as any).__neonArena.game.powerPickups.length)).toBeGreaterThanOrEqual(3)
  await expect.poll(() => page.evaluate(() => (window as any).__neonArena.game.lightScale)).toBeGreaterThan(0.95)

  // Zombie dorato e reazione a catena insieme, con l'ondata piena: il caso più pesante.
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.startWaveEvent('golden-zombie')
    game.goldenPending = 0.01
  })
  await expect.poll(() => page.evaluate(() => (window as any).__neonArena.game.enemies.some((enemy: any) => enemy.golden))).toBe(true)
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.waveEvent = 'chain-reaction'
  })
  await page.waitForFunction(() => (window as any).__neonArena.game.enemies.length >= 14)
  // Durante la misura muore uno zombie ogni 4 frame: esplosioni a catena, bonus e kit medici.
  const frames = await page.evaluate(async () => new Promise<number[]>((resolve) => {
    const game = (window as any).__neonArena.game
    const deltas: number[] = []
    let previous = 0
    const frame = (now: number) => {
      if (previous > 0) deltas.push(now - previous)
      previous = now
      if (deltas.length % 4 === 0) {
        const victim = game.enemies.find((enemy: any) => enemy.health > 0 && enemy.spawnTimer <= 0)
        if (victim) victim.health = 0
      }
      if (deltas.length >= 60) resolve(deltas)
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }))
  expect(frames.length).toBe(60)
  // Stesso criterio del test dell'ondata piena: picchi rispetto alla mediana della macchina.
  const sorted = [...frames].sort((first, second) => first - second)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const spikes = frames.filter((duration) => duration > Math.max(100, median * 3))
  expect(spikes.length, `mediana ${Math.round(median)} ms, picchi ${spikes.map(Math.round).join(', ')}`).toBeLessThanOrEqual(Math.max(1, Math.floor(frames.length * 0.02)))
  expect(await page.evaluate(() => (window as any).__neonArena.game.kills)).toBeGreaterThan(5)
  expect(errors).toEqual([])
})

test('le uccisioni smembrano, lasciano sangue, fanno combo ed esecuzioni senza cali di frame', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => window.localStorage.setItem('neon-arena:graphics:v1', 'low'))
  await page.goto('/')
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing')
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.clearEntities()
    game.activePowerUps.set('barrier', 999)
    game.wave = 6
    game.nextWave()
    game.startWaveEvent(null)
    game.debugPlace(0, 0, 12, 0, 0)
  })
  await page.waitForFunction(() => (window as any).__neonArena.game.enemies.filter((enemy: any) => enemy.spawnTimer <= 0).length >= 6)

  // Sangue completo: le esplosioni staccano arti, a terra restano macchie; due uccisioni = combo.
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    for (const enemy of game.enemies.filter((candidate: any) => candidate.spawnTimer <= 0 && candidate.kind !== 'brute').slice(0, 3)) {
      enemy.lastCause = 'explosion'
      enemy.health = 0
    }
  })
  await expect.poll(() => page.evaluate(() => (window as any).__neonArena.game.gore.debrisCount)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).__neonArena.game.gore.poolCount)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).__neonArena.game.feats.explosiveKills)).toBeGreaterThanOrEqual(3)
  await expect(page.locator('#combo-meter')).toBeVisible()
  await expect(page.locator('#combo-count')).toHaveText(/×[2-9]/)

  // Esecuzione: uno zombie quasi morto davanti al giocatore si finisce con il corpo a corpo.
  const executed = await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    const enemy = game.enemies.find((candidate: any) => candidate.spawnTimer <= 0 && candidate.kind !== 'brute' && candidate.health > 0)
    if (!enemy) return null
    const forward = game.camera.getWorldDirection(enemy.body.position.clone()).setY(0).normalize()
    enemy.body.position.set(game.player.x + forward.x * 1.4, game.player.y, game.player.z + forward.z * 1.4)
    enemy.health = enemy.maxHealth * 0.1
    enemy.speed = 0
    return enemy.netId
  })
  expect(executed).not.toBeNull()
  await expect(page.locator('#execution-prompt')).toBeVisible()
  const healthBefore = await page.evaluate(() => (window as any).__neonArena.game.health)
  await page.keyboard.press('KeyF')
  await expect(page.locator('#combo-callout')).toContainText('ESECUZIONE')
  await expect.poll(() => page.evaluate((id) => (window as any).__neonArena.game.enemies.some((enemy: any) => enemy.netId === id), executed)).toBe(false)
  expect(await page.evaluate(() => (window as any).__neonArena.game.health)).toBeGreaterThanOrEqual(healthBefore)

  // Molte uccisioni con smembramento di fila: nessun picco rispetto alla mediana.
  await page.waitForFunction(() => (window as any).__neonArena.game.enemies.length >= 8)
  const frames = await page.evaluate(async () => new Promise<number[]>((resolve) => {
    const game = (window as any).__neonArena.game
    const deltas: number[] = []
    let previous = 0
    const frame = (now: number) => {
      if (previous > 0) deltas.push(now - previous)
      previous = now
      if (deltas.length % 3 === 0) {
        const victim = game.enemies.find((enemy: any) => enemy.health > 0 && enemy.spawnTimer <= 0)
        if (victim) {
          victim.lastCause = deltas.length % 2 === 0 ? 'explosion' : 'bullet'
          victim.lastZone = 'head'
          victim.health = 0
        }
      }
      if (deltas.length >= 60) resolve(deltas)
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }))
  const sorted = [...frames].sort((first, second) => first - second)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const spikes = frames.filter((duration) => duration > Math.max(100, median * 3))
  expect(spikes.length, `mediana ${Math.round(median)} ms, picchi ${spikes.map(Math.round).join(', ')}`).toBeLessThanOrEqual(Math.max(1, Math.floor(frames.length * 0.02)))

  // Senza sangue: nessun arto staccato e nessuna macchia.
  await page.evaluate(() => {
    const game = (window as any).__neonArena.game
    game.gore.clear()
    game.setAccessibility({ reducedMotion: false, highContrast: false, sensitivity: 1, adsSensitivity: 1, gore: 'off', damageNumbers: false })
    for (const enemy of game.enemies.filter((candidate: any) => candidate.spawnTimer <= 0).slice(0, 3)) {
      enemy.lastCause = 'explosion'
      enemy.health = 0
    }
  })
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => [(window as any).__neonArena.game.gore.debrisCount, (window as any).__neonArena.game.gore.poolCount])).toEqual([0, 0])
  expect(errors).toEqual([])
})
