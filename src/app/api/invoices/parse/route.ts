import { NextRequest, NextResponse } from 'next/server'
import { parseInvoicePDF } from '@/lib/invoicing/parse-invoice-pdf'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo se aceptan PDFs' }, { status: 400 })
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF demasiado grande (max 20MB)' }, { status: 400 })
    }

    const arrayBuf = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuf)

    const result = await parseInvoicePDF(buf)

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Fallo el parseo' }, { status: 500 })
    }

    return NextResponse.json({ data: result.data })
  } catch (err) {
    console.error('POST /api/invoices/parse error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
