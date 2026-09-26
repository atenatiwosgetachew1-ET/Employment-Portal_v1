import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, reset: () => this.setState({ hasError: false, error: null }) })
      }
      if (fallback) return fallback

      return (
        <div className="page centered-page">
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <h1>Something went wrong</h1>
            <p className="muted-text">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
