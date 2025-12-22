
import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    console.error("UI Crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-slate-500">
              Please refresh the page.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
    