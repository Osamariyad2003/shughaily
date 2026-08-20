// Portfolio screenshot capture — headless Playwright automation.
// Logs in with a pre-issued JWT (via localStorage), then walks the key
// screens/workflows and saves full-page PNGs into <project-root>/screenshots/.
//
// Usage (from frontend/): node scripts/capture-screenshots.mjs
// Requires: frontend dev server on :5173, backend on :4000, ai-service on
// :5050, and a valid JWT in /tmp/screenshot_token.txt (or TOKEN env var).

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', '..', 'screenshots')
const BASE_URL = 'http://localhost:5173'

mkdirSync(OUT_DIR, { recursive: true })

const token =
  process.env.TOKEN?.trim() ||
  readFileSync('/tmp/screenshot_token.txt', 'utf-8').trim()

async function shoot(page, name, { fullPage = true } = {}) {
  const path = join(OUT_DIR, name)
  await page.screenshot({ path, fullPage })
  console.log(`saved ${name}`)
}

// Waits for the page's loading spinner (if any) to actually disappear
// before proceeding, instead of a fixed delay — a slow/cold backend would
// otherwise get captured mid-spinner with a fixed wait. Falls back
// gracefully (no-op) if no spinner ever appears on this page.
async function waitForReady(page, { settle = 700, spinnerTimeout = 15000 } = {}) {
  await page
    .locator('svg.animate-spin')
    .first()
    .waitFor({ state: 'detached', timeout: spinnerTimeout })
    .catch(() => {})
  await page.waitForTimeout(settle)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  // ── 1. Landing / login screen (logged out) ──────────────────────────
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '01-login.png')

  // ── 2. Validation error state on the login form ─────────────────────
  await page.getByPlaceholder('name@example.com').fill('not-an-account@example.com')
  await page.locator('input[type="password"]').fill('wrongpassword123')
  await page.getByRole('button', { name: /متابعة إلى لوحة التحكم|Continue to dashboard/ }).click()
  await page.waitForTimeout(900)
  await shoot(page, '02-login-error-state.png')

  // ── Authenticate by injecting the JWT directly, then reload ─────────
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '03-dashboard.png')

  // ── 4. Jobs — search agents + recommended feed (main workflow) ──────
  // Viewport-only (not fullPage): the recommended-jobs list can render
  // hundreds of cards with no virtualization, which would otherwise
  // produce an absurdly tall image instead of a usable screenshot.
  await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'load' })
  await waitForReady(page, { settle: 1200 })
  await shoot(page, '04-jobs-search-agents.png', { fullPage: false })

  // ── 5. Job detail — match score, ATS review, cover letter tools ─────
  // Actually trigger the match-score and ATS-review AI calls so the
  // screenshot shows real generated results, not just empty action
  // buttons — this is the flagship "AI features" screen.
  try {
    // Job cards in the list are plain onClick divs, not <a> tags (only
    // the details panel's secondary links are real anchors), so select
    // a job directly by navigating to a known job id instead of relying
    // on a fragile DOM query.
    const knownJobId = process.env.JOB_ID
    if (knownJobId) {
      await page.goto(`${BASE_URL}/jobs/${knownJobId}`, { waitUntil: 'load' })
      await waitForReady(page, { settle: 500 })

      const matchBtn = page.getByRole('button', { name: /حساب التطابق|Calculate match/ })
      if (await matchBtn.count()) {
        await matchBtn.click({ timeout: 5000 })
        await page.waitForTimeout(3000)
      }

      const atsBtn = page.getByRole('button', { name: /ابدأ الفحص|Start review/ })
      if (await atsBtn.count()) {
        // Don't reuse this locator after clicking — the button's own text
        // changes ("Start review" → "Re-run") once the review completes,
        // so re-resolving the same name-matched locator afterward hangs.
        await atsBtn.click({ timeout: 5000 })
        await page.waitForTimeout(10000)
        await page.mouse.wheel(0, 900)
        await page.waitForTimeout(500)
      }

      await shoot(page, '05-job-detail.png')
    } else {
      console.warn('No JOB_ID env var set — skipping 05-job-detail.png')
    }
  } catch (err) {
    console.error('job-detail capture failed, continuing:', err.message)
  }

  // ── 6. Resume manager ────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/resume`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '06-resume-manager.png')

  // ── 7. Application tracker (kanban) ─────────────────────────────────
  await page.goto(`${BASE_URL}/applications`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '07-applications-tracker.png')

  // ── 8. Saved jobs ────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/saved`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '08-saved-jobs.png')

  // ── 9. Copilot chat ──────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/copilot`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '09-copilot-chat.png')

  // ── 10. Billing / usage ──────────────────────────────────────────────
  await page.goto(`${BASE_URL}/billing`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '10-billing.png')

  // ── 11. Settings (with the language toggle visible) ──────────────────
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'load' })
  await waitForReady(page)
  await shoot(page, '11-settings.png')

  await browser.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
