import React from 'react';

interface State { hasError: boolean; }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('SchoolOS screen failed to render.', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#F3F6F6] flex items-center justify-center p-4">
          <section role="alert" className="max-w-md w-full rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-[#132A29]">This screen could not load</h1>
            <p className="mt-2 text-sm text-[#64748B]">An unexpected error interrupted the page. Retry to load it again.</p>
            <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white">Retry</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
