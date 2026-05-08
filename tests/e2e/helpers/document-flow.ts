/**
 * Helpers para manipular documentos via UI — para tests E2E del happy path.
 *
 * Estos helpers asumen que la app tiene los `data-testid` agregados en
 * el commit `17c4f4f` (doc-code, doc-status, doc-edit, doc-save,
 * doc-back, doc-add-item, doc-search-product).
 *
 * Cuando UI cambia, tocar acá centralmente.
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Crea una cotización draft. Asume que estás logueado y se navega
 * a /cotizador → tab "Nueva".
 *
 * Devuelve el doc_code asignado al draft.
 */
export async function createQuote(
  page: Page,
  opts: { clientName: string; productSkus: string[] }
): Promise<string> {
  await page.goto('/cotizador')
  // Cambiar a vista "Nueva cotización"
  await page.getByRole('button', { name: /nueva cotizaci[oó]n/i }).click()

  // Seleccionar cliente: input search del cliente
  const clientSearch = page.locator('input[placeholder*="cliente" i]').first()
  await clientSearch.waitFor({ state: 'visible', timeout: 10000 })
  await clientSearch.fill(opts.clientName)
  await page.locator('text=' + opts.clientName).first().click()

  // Agregar productos por SKU usando "Buscar producto"
  for (const sku of opts.productSkus) {
    await page.getByTestId('doc-search-product').click()
    const productSearch = page.locator('input[placeholder*="producto" i]').first()
    await productSearch.waitFor({ state: 'visible', timeout: 5000 })
    await productSearch.fill(sku)
    // Click en el primer resultado (asume que el seed product tiene SKU exacto)
    await page.locator(`text=${sku}`).first().click()
  }

  // Guardar draft
  await page.getByTestId('doc-save').click()

  // Leer el code generado (data-testid="doc-code")
  await page.getByTestId('doc-code').waitFor({ state: 'visible', timeout: 10000 })
  const code = (await page.getByTestId('doc-code').textContent())?.trim() ?? ''
  expect(code).toMatch(/^[A-Z]+/)

  return code
}

/**
 * Emite el documento actualmente abierto en el detalle.
 * Pasa de status='draft' a 'issued' (o equivalente).
 */
export async function issueDocument(page: Page) {
  // Botón "Emitir" suele estar en la action bar del documento.
  // Si no tiene data-testid propio aún, usamos rol + texto.
  const issueBtn = page.getByRole('button', { name: /emitir|issue/i }).first()
  await issueBtn.waitFor({ state: 'visible', timeout: 10000 })
  await issueBtn.click()

  // Confirmar en modal si aparece
  const confirmBtn = page.getByRole('button', { name: /confirmar|sí|emitir/i }).last()
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click()
  }

  // Esperar que el status cambie
  await expect(page.getByTestId('doc-status')).toContainText(/issued|emitid|enviada/i, { timeout: 15000 })
}

/**
 * Deriva el documento actual a un nuevo tipo (sales_order, delivery_note,
 * invoice, etc.). Devuelve el code del documento derivado.
 */
export async function deriveDocument(
  page: Page,
  targetType: 'sales_order' | 'delivery_note' | 'invoice'
): Promise<string> {
  // Click en menú "Derivar" / "Convertir"
  await page.getByRole('button', { name: /derivar|convertir/i }).first().click()

  // Seleccionar el tipo destino
  const labels: Record<string, RegExp> = {
    sales_order: /pedido|sales[- ]order/i,
    delivery_note: /albar[aá]n|remito|delivery/i,
    invoice: /factura|invoice/i,
  }
  await page.getByRole('menuitem', { name: labels[targetType] }).click()

  // Confirmar en modal
  const confirmBtn = page.getByRole('button', { name: /confirmar|derivar|crear/i }).last()
  await confirmBtn.click()

  // El doc nuevo debería abrir en su detalle. Leer su code.
  await page.getByTestId('doc-code').waitFor({ state: 'visible', timeout: 15000 })
  const code = (await page.getByTestId('doc-code').textContent())?.trim() ?? ''
  return code
}

/**
 * Registra un pago contra una factura abierta. Por default registra
 * el total para que la factura pase a status 'paid'.
 */
export async function registerPayment(
  page: Page,
  opts: { method?: 'cash' | 'transfer'; amount?: number } = {}
) {
  // Tab "Pagos" o botón "Registrar pago"
  const payBtn = page.getByRole('button', { name: /registrar pago|cobrar|pagar/i }).first()
  await payBtn.waitFor({ state: 'visible', timeout: 10000 })
  await payBtn.click()

  // Form de pago
  if (opts.method) {
    await page.getByLabel(/m[eé]todo|method/i).selectOption(opts.method)
  }
  if (opts.amount != null) {
    await page.getByLabel(/monto|amount|importe/i).fill(String(opts.amount))
  }

  await page.getByRole('button', { name: /guardar|confirmar/i }).last().click()

  // Status final
  await expect(page.getByTestId('doc-status')).toContainText(/paid|cobrad|pagad/i, { timeout: 15000 })
}
