import { getAdminClient } from '@/lib/supabase/admin'
import { BuscadorClientesTable } from './BuscadorClientesTable'

export const dynamic = 'force-dynamic'

export default async function BuscadorClientesPage() {
  const supabase = getAdminClient()

  // Traer todos los clientes del buscador ordenados: pendientes primero, luego por fecha DESC
  const { data: clientes, error } = await supabase
    .from('buscador_clientes')
    .select('id, full_name, company, phone, country, approved, approved_at, created_at, user_id')
    .order('approved', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600 font-medium">Error al cargar clientes: {error.message}</p>
      </div>
    )
  }

  // Obtener emails de auth.users para los user_ids presentes
  const userIds = (clientes ?? [])
    .map((c) => c.user_id)
    .filter(Boolean) as string[]

  const emailMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    for (const u of authUsers?.users ?? []) {
      if (userIds.includes(u.id)) {
        emailMap[u.id] = u.email ?? ''
      }
    }
  }

  const rows = (clientes ?? []).map((c) => ({
    ...c,
    email: c.user_id ? (emailMap[c.user_id] ?? '') : '',
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes del Buscador</h1>
        <p className="text-sm text-gray-500 mt-1">
          Clientes registrados en el buscador público. Aprobá o revocá el acceso desde acá.
        </p>
      </div>

      <div className="flex gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
          Pendientes: {rows.filter((r) => !r.approved).length}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          Aprobados: {rows.filter((r) => r.approved).length}
        </span>
      </div>

      <BuscadorClientesTable rows={rows} />
    </div>
  )
}
