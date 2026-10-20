import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { formatError } from '../lib/api'
import { supabase } from '../lib/supabase'

export type AuthActionResult = {
  ok: boolean
  message?: string
  error?: string
}

const RECOVERY_KEY = 'beertasting:password-recovery'

const readRecoveryFlag = () => {
  try {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

const writeRecoveryFlag = (value: boolean) => {
  try {
    if (typeof window === 'undefined') return
    if (value) {
      window.sessionStorage.setItem(RECOVERY_KEY, '1')
    } else {
      window.sessionStorage.removeItem(RECOVERY_KEY)
    }
  } catch {
    // sessionStorage can be unavailable in private browsing modes.
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(readRecoveryFlag)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    let authEventReceived = false

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return
        if (sessionError && !authEventReceived) {
          setError(formatError(sessionError))
        }
        // An auth event is more recent than the initial getSession result.
        if (!authEventReceived) {
          setSession(data.session)
        }
      })
      .catch((caught) => {
        if (active) setError(formatError(caught))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Do not await other Supabase calls inside this callback. Supabase's
      // auth lock can deadlock when the callback performs network requests.
      authEventReceived = true
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true)
        writeRecoveryFlag(true)
      }
      if (event === 'SIGNED_OUT') {
        setRecovery(false)
        writeRecoveryFlag(false)
      }
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { ok: false, error: 'Supabase is not configured.' } satisfies AuthActionResult
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      return { ok: false, error: formatError(signInError) } satisfies AuthActionResult
    }

    return { ok: true } satisfies AuthActionResult
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { ok: false, error: 'Supabase is not configured.' } satisfies AuthActionResult
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      return { ok: false, error: formatError(signUpError) } satisfies AuthActionResult
    }

    if (!data.session) {
      return {
        ok: true,
        message: 'Account created. Check your inbox to confirm the email before signing in.',
      } satisfies AuthActionResult
    }

    return { ok: true } satisfies AuthActionResult
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return { ok: false, error: 'Supabase is not configured.' } satisfies AuthActionResult
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })

    if (resetError) {
      return { ok: false, error: formatError(resetError) } satisfies AuthActionResult
    }

    return {
      ok: true,
      message: 'If that email exists, a password reset link has been sent.',
    } satisfies AuthActionResult
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) {
      return { ok: false, error: 'Supabase is not configured.' } satisfies AuthActionResult
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      return { ok: false, error: formatError(updateError) } satisfies AuthActionResult
    }

    setRecovery(false)
    writeRecoveryFlag(false)
    return { ok: true, message: 'Password updated.' } satisfies AuthActionResult
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setRecovery(false)
    writeRecoveryFlag(false)

    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setError(formatError(signOutError))
      }
    } catch (caught) {
      setError(formatError(caught))
    }
  }, [])

  return {
    session,
    loading,
    error,
    recovery,
    clearError: () => setError(null),
    clearRecovery: () => setRecovery(false),
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
  }
}
