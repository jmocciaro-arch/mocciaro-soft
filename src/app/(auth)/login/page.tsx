'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Lock, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

type Mode = 'login' | 'reset'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError('Credenciales incorrectas. Verificá tu email y contraseña.')
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    if (!email.trim()) {
      setError('Ingresá tu email para recibir el link de recuperación.')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : undefined
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (resetError) {
        setError(resetError.message || 'No pudimos enviar el email. Verificá la dirección.')
        return
      }

      setInfo(`Te enviamos un email a ${email} con instrucciones para resetear tu contraseña. Revisá la bandeja de entrada (y spam).`)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E13] px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FF6600]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FF6600]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FF6600] mb-4 shadow-lg shadow-orange-500/20">
            <span className="text-white font-bold text-3xl italic" style={{ fontFamily: 'Georgia, serif' }}>M</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Mocciaro Soft</h1>
          <p className="text-[#6B7280] mt-1">Sistema de Gestión Integral</p>
        </div>

        {/* Login / Reset Card */}
        <div className="bg-[#141820] border border-[#1E2330] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-[#F0F2F5] mb-6">
            {mode === 'login' ? 'Iniciá sesión' : 'Recuperar contraseña'}
          </h2>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-400">{info}</p>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={18} />}
                required
              />
              <Input
                label="Contraseña"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={18} />}
                required
              />
              <Button type="submit" loading={loading} className="w-full mt-2">
                Ingresar
              </Button>
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setInfo('') }}
                className="w-full text-center text-xs text-[#9CA3AF] hover:text-[#FF6600] transition mt-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <p className="text-xs text-[#9CA3AF] -mt-2 mb-2">
                Ingresá tu email y te mandamos un link para crear una nueva contraseña.
              </p>
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={18} />}
                required
              />
              <Button type="submit" loading={loading} className="w-full mt-2">
                Enviar instrucciones
              </Button>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo('') }}
                className="w-full flex items-center justify-center gap-1 text-xs text-[#9CA3AF] hover:text-[#FF6600] transition mt-1"
              >
                <ArrowLeft size={11} /> Volver al login
              </button>
            </form>
          )}

          <p className="text-center text-xs text-[#4B5563] mt-6">
            Grupo Mocciaro &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
