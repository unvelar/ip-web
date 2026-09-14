import { Component, type ErrorInfo, type ReactNode } from "react";

export default class RouteErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() { return { failed: true }; }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unable to render route", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-stone-900">This page couldn’t load</h1>
        <p className="mt-3 text-sm text-stone-500">Reload to try again. If the problem continues, please contact your workspace administrator.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white">Reload page</button>
      </div>
    );
  }
}
