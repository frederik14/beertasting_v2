type Props = {
  label?: string
}

export function LoadingPanel({ label = 'Loading…' }: Props) {
  return (
    <section className="panel full-width loading-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </section>
  )
}
