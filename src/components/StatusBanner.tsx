import type { ReactNode } from 'react'

export type BannerTone = 'error' | 'success' | 'info' | 'warning'

type Props = {
  tone: BannerTone
  children: ReactNode
  onDismiss?: () => void
}

export function StatusBanner({ tone, children, onDismiss }: Props) {
  return (
    <div
      className={`banner banner-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <div className="banner-message">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          className="banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
