// -----------------------------------------------------------------------------
// htmlToPdf — adapter pluggable.
// Detecta en runtime qué motor HTML→PDF está disponible y lo usa:
//
//   1. puppeteer              (prod + dev con Chrome local)
//   2. puppeteer-core         (serverless con @sparticuz/chromium)
//   3. playwright / playwright-core
//   4. fallback: devuelve null → el endpoint responde 501 con instrucciones
//
// No agrega dependencias al package.json. El import es dinámico y si falla la
// resolución el motor se marca como no disponible. Esto nos permite decidir el
// motor en deploy sin tocar este archivo ni bloquear el build.
//
// Configuración opcional via env var:
//   DOCS_PDF_ENGINE=puppeteer|puppeteer-core|playwright|none
//   DOCS_PDF_CHROME_PATH=/usr/bin/google-chrome    (puppeteer-core)
// -----------------------------------------------------------------------------

type PdfEngine = 'puppeteer' | 'puppeteer-core' | 'playwright' | 'playwright-core' | null

export interface HtmlToPdfOptions {
  format?: 'A4' | 'Letter'
  printBackground?: boolean
  margin?: { top: string; right: string; bottom: string; left: string }
}

export interface HtmlToPdfResult {
  pdf: Buffer
  engine: Exclude<PdfEngine, null>
}

export interface HtmlToPdfError {
  error: string
  status: number
  hint: string
}

const DEFAULT_OPTS: Required<HtmlToPdfOptions> = {
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', right: '14mm', bottom: '20mm', left: '14mm' },
}

// Cache del engine elegido por proceso.
let cachedEngine: PdfEngine | undefined

// Import dinámico con nombre indirecto — evita que el bundler (webpack/turbopack)
// intente resolver en tiempo de build. Si el paquete no está instalado, falla
// en runtime y el adapter pasa al siguiente candidato.
async function softImport(name: string): Promise<unknown> {
  const mod = name
  return await import(/* @vite-ignore */ /* webpackIgnore: true */ mod)
}

async function detectEngine(): Promise<PdfEngine> {
  if (cachedEngine !== undefined) return cachedEngine

  const forced = (process.env.DOCS_PDF_ENGINE || '').trim().toLowerCase() as PdfEngine | 'none' | ''
  if (forced === 'none') { cachedEngine = null; return null }

  const candidates: Array<Exclude<PdfEngine, null>> = forced
    ? [forced as Exclude<PdfEngine, null>]
    : ['puppeteer', 'puppeteer-core', 'playwright', 'playwright-core']

  for (const name of candidates) {
    try {
      await softImport(name)
      cachedEngine = name
      return name
    } catch {
      // sigue probando
    }
  }
  cachedEngine = null
  return null
}

export async function htmlToPdf(
  html: string,
  opts: HtmlToPdfOptions = {},
): Promise<HtmlToPdfResult | HtmlToPdfError> {
  const options = { ...DEFAULT_OPTS, ...opts, margin: { ...DEFAULT_OPTS.margin, ...(opts.margin ?? {}) } }
  const engine = await detectEngine()

  if (!engine) {
    return {
      error: 'PDF engine no configurado',
      status: 501,
      hint:
        'Instalá uno de: `puppeteer` (dev), `puppeteer-core` + `@sparticuz/chromium` (Vercel), ' +
        'o `playwright`. Alternativa: usar el endpoint /html e imprimir desde el navegador.',
    }
  }

  try {
    if (engine === 'puppeteer' || engine === 'puppeteer-core') {
      return { pdf: await renderWithPuppeteer(html, options, engine), engine }
    }
    if (engine === 'playwright' || engine === 'playwright-core') {
      return { pdf: await renderWithPlaywright(html, options, engine), engine }
    }
    return { error: `Motor desconocido: ${engine}`, status: 500, hint: 'Revisar DOCS_PDF_ENGINE' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `Falla del motor ${engine}: ${msg}`, status: 500, hint: 'Revisar logs del servidor' }
  }
}

// -----------------------------------------------------------------------------
// Puppeteer
// -----------------------------------------------------------------------------
async function renderWithPuppeteer(
  html: string,
  opts: Required<HtmlToPdfOptions>,
  engine: 'puppeteer' | 'puppeteer-core',
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await softImport(engine)
  const puppeteer = mod.default ?? mod

  let launchArgs: Record<string, unknown> = { headless: true }
  if (engine === 'puppeteer-core') {
    const chromePath = process.env.DOCS_PDF_CHROME_PATH
    if (chromePath) launchArgs.executablePath = chromePath
    // Soporte @sparticuz/chromium si está presente.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spartMod: any = await softImport('@sparticuz/chromium')
      const chromium = spartMod.default ?? spartMod
      launchArgs = {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      }
    } catch { /* opcional */ }
  }

  const browser = await puppeteer.launch(launchArgs)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const buf = await page.pdf({
      format: opts.format,
      printBackground: opts.printBackground,
      margin: opts.margin,
      preferCSSPageSize: true,
    })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}

// -----------------------------------------------------------------------------
// Playwright
// -----------------------------------------------------------------------------
async function renderWithPlaywright(
  html: string,
  opts: Required<HtmlToPdfOptions>,
  engine: 'playwright' | 'playwright-core',
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await softImport(engine)
  const { chromium } = mod

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const buf = await page.pdf({
      format: opts.format,
      printBackground: opts.printBackground,
      margin: opts.margin,
      preferCSSPageSize: true,
    })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}
