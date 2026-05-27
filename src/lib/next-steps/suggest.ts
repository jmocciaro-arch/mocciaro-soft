/**
 * Sugerir acción primaria (★) según el estado del documento.
 *
 * Mapea estados en español (borrador/enviado/visto/aceptada/ganado) y
 * en inglés (draft/sent/viewed/accepted) al action_code recomendado.
 */
import type { ActionCode } from './types'

export function suggestPrimary(status: string | null | undefined): ActionCode {
  const s = String(status ?? '').toLowerCase().trim()
  switch (s) {
    case 'draft':
    case 'borrador':
      return 'preview_pdf'
    case 'sent':
    case 'enviado':
      return 'send_email'
    case 'viewed':
    case 'visto':
      return 'send_email'
    case 'accepted':
    case 'aceptada':
    case 'ganado':
      return 'convert_to_sales_order'
    default:
      return 'preview_pdf'
  }
}
