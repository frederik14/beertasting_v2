import { useCallback, useEffect, useState } from 'react'

/**
 * Small URL-state helper. Tenant and tasting selection belong in the URL so a
 * refresh or a shared link opens the same context, without adding a router.
 */
export function useUrlParam(name: string) {
  const read = useCallback(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get(name)
  }, [name])

  const [value, setValue] = useState<string | null>(read)

  useEffect(() => {
    const onPopState = () => setValue(read())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [read])

  const update = useCallback(
    (next: string | null) => {
      setValue(next)
      const url = new URL(window.location.href)
      if (next) {
        url.searchParams.set(name, next)
      } else {
        url.searchParams.delete(name)
      }
      window.history.replaceState({}, '', url)
    },
    [name],
  )

  return [value, update] as const
}
