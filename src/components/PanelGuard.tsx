"use client";
// 🔧 TEMPORARY diagnostic error boundary (Jon 2026-10-26: full contact page 500s for
// managers/dispo). A page-level try/catch can't catch a throw inside a CHILD component's
// render — React renders those separately — so this class boundary wraps the render and
// shows which part failed + the error, instead of the whole page dying. REMOVE once fixed.
import React from "react";

export default class PanelGuard extends React.Component<
  { label: string; children: React.ReactNode },
  { err: Error | null }
> {
  constructor(props: { label: string; children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <pre style={{ whiteSpace: "pre-wrap", padding: 12, fontSize: 11, color: "#b91c1c", background: "#fff1f2", borderRadius: 12, margin: 8, fontFamily: "ui-monospace, monospace" }}>
          {"⚠️ [" + this.props.label + "] failed (temporary diagnostic):\n\n"}
          {(this.state.err?.message || String(this.state.err)) + "\n\n"}
          {this.state.err?.stack || ""}
        </pre>
      );
    }
    return this.props.children;
  }
}
