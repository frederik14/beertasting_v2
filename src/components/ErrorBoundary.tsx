import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BeerTasting render error', error, info)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="app-shell">
          <section className="panel full-width">
            <p className="eyebrow">Something went wrong</p>
            <h1>The app hit an unexpected error</h1>
            <p className="status-text">{this.state.error.message}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
          </section>
        </div>
      )
    }

    return this.props.children
  }
}
