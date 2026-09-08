'use client'

import { useApp } from '@/src/store/AppContext'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import Swal from 'sweetalert2'
import { logAudit } from '@/src/utils/auditLogger'
import { FileText, Shield, Check, Bot, Bell, Loader2, Eye, EyeOff } from 'lucide-react'
import branding from '@/src/config/branding'

function LoginScreen() {
  const { state, dispatch } = useApp()
  const router = useRouter()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('password123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Warm the dashboard route's JS/data as soon as the login page is visible, so the
  // post-login redirect below (which only happens once the success alert has already
  // closed, plenty of time later) lands on an already-fetched route instead of
  // triggering a fresh compile/fetch right when the user is staring at a blank page.
  useEffect(() => {
    router.prefetch('/dashboard')
  }, [router])

  const handleLogin = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await axios.post('/api/users/login', { username, password })
      const data = res.data
      // Set Authorization header immediately -- before any protected API call
      if (data.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      }
      const user = { ...data, roleId: data.roleCode }

      await logAudit(
        {
          userId: user.id,
          userName: user.fullName,
          action: 'Login',
          module: 'Authentication',
          details: 'User logged in to the system',
        },
        dispatch
      )

      // Show the success confirmation and wait for it to close before flipping
      // isAuthenticated -- dispatching LOGIN first would trigger the root page's own
      // redirect effect *and* this function's navigation at nearly the same moment,
      // a race that was producing the blank-then-dashboard flash. Sequencing it this way
      // means exactly one thing ever triggers the navigation.
      await Swal.fire({
        title: 'Success!',
        text: 'Logged in successfully',
        icon: 'success',
        timer: 1200,
        showConfirmButton: false,
      })

      dispatch({ type: 'LOGIN', payload: user })
      router.push('/dashboard')
    } catch {
      setError('Invalid username or password')
      Swal.fire('Oops!', 'Invalid username or password', 'error')
      setLoading(false)
    }
  }

  const appName = String(state.systemSettings?.appName || branding.appName)
  const year = new Date().getFullYear()
  const chipIcons = [<Bot size={14} />, <Shield size={14} />, <Bell size={14} />, <FileText size={14} />]

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f4f7f6] via-[#e2e8f0] to-[#cbd5e1] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">

      {/* Animated background blobs */}
      <div className="animate-pulse-blob absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: branding.accentColor }} />
      <div className="animate-pulse-blob-delay absolute bottom-[-10%] right-[-10%] w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: branding.accentDark }} />

      <div className="max-w-6xl w-full flex flex-col lg:flex-row items-center gap-12 relative z-10">

        {/* ── LEFT: Marketing panel ── */}
        <div className="animate-fade-in-left lg:w-1/2 text-left space-y-6">

          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-8 inline-block" style={{ backgroundColor: branding.accentColor }} />
            <h5 className="text-xs font-black tracking-[0.3em] uppercase text-slate-500">
              {branding.loginBadge}
            </h5>
          </div>

          <h1 className="text-4xl lg:text-6xl font-black text-slate-800 leading-tight tracking-tight">
            {branding.loginHeadlinePre}{' '}
            <span style={{ color: branding.accentColor }}>{branding.loginHeadlineAccent}</span>{' '}
            {branding.loginHeadlinePost}
          </h1>

          <div className="text-slate-600 text-base lg:text-lg max-w-md leading-relaxed font-medium space-y-2">
            {branding.loginFeatures.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check size={14} style={{ color: branding.accentColor }} className="shrink-0" strokeWidth={3} />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {branding.loginChips.map((label, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full border border-white shadow-sm">
                <span style={{ color: branding.accentColor }}>{chipIcons[i % chipIcons.length]}</span>
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Login card ── */}
        <div className="lg:w-1/2 w-full max-w-md">
          <div className="animate-zoom-in bg-white/90 backdrop-blur-md p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/50">

            {/* Card header */}
            <div className="flex justify-between items-center mb-10 w-full">
              <div className="flex items-center gap-3 animate-heart-beat">
                {branding.logoPath ? (
                  <img src={branding.logoPath} alt={appName} className="h-8 w-auto max-w-[140px] object-contain" />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                      style={{ background: `linear-gradient(135deg, ${branding.accentColor}, ${branding.accentDark})` }}>
                      <FileText size={20} color="#fff" />
                    </div>
                    <span className="text-sm font-black text-slate-800 uppercase tracking-wide">{appName}</span>
                  </>
                )}
              </div>
              <h4 className="animate-back-in-right text-2xl font-black text-slate-800 tracking-tight whitespace-nowrap">
                LOG IN
              </h4>
            </div>

            {/* Form */}
            <div className="animate-back-in-up space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="Enter your username"
                    autoFocus
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 transition-all text-sm bg-slate-50/50"
                    style={{ '--tw-ring-color': branding.accentColor } as React.CSSProperties}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="••••••••"
                      className="appearance-none block w-full px-4 py-3 pr-11 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 transition-all text-sm bg-slate-50/50"
                      style={{ '--tw-ring-color': branding.accentColor } as React.CSSProperties}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

              <div className="flex flex-col space-y-3 pt-1">
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  style={{ backgroundColor: branding.accentColor }}
                  onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.backgroundColor = branding.accentDark)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = branding.accentColor)}
                  className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'LOG IN'}
                </button>

                <div className="flex flex-col items-center space-y-1 text-xs">
                  <button
                    type="button"
                    className="text-slate-400 font-medium transition-colors"
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = branding.accentColor)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '')}
                  >
                    Forgot Password?
                  </button>
                  <p className="text-[11px] text-slate-400 pt-1">
                    <a href="/privacy-policy" className="hover:text-slate-600 underline">Privacy Policy</a>
                    <span className="mx-2">·</span>
                    <a href="/terms-of-service" className="hover:text-slate-600 underline">Terms of Service</a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="animate-fade-in-delay mt-6 text-center">
            <p className="text-[10px] text-slate-400 font-bold tracking-[0.2em] uppercase">
              © {year} {appName}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

// The root route: shows the login screen when signed out, otherwise immediately hands off
// to the real /dashboard route (every other view now has its own real page under app/(app)).
export default function Page() {
  const { state } = useApp()
  const { isAuthenticated, isHydrated } = state
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && isAuthenticated) router.replace('/dashboard')
  }, [isHydrated, isAuthenticated])

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isAuthenticated) return null
  return <LoginScreen />
}
