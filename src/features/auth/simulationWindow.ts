export interface SimulationWindowState {
  title: string;
  message: string;
  error?: boolean;
}

/** Render same-origin launch feedback without coupling the admin page to DOM construction. */
export function renderSimulationWindow(target: Window, state: SimulationWindowState) {
  if (target.closed) return;
  try {
    const document = target.document;
    document.title = state.title;
    document.documentElement.style.background = "#faf8f5";
    document.body.replaceChildren();
    Object.assign(document.body.style, {
      margin: "0",
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      color: "#1c1917",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    });

    const card = document.createElement("main");
    Object.assign(card.style, {
      width: "min(440px, calc(100vw - 48px))",
      padding: "32px",
      border: `1px solid ${state.error ? "#fecaca" : "#e7e5e4"}`,
      borderRadius: "20px",
      background: "#ffffff",
      boxShadow: "0 16px 48px rgba(28, 25, 23, 0.08)",
      textAlign: "center",
    });

    const mark = document.createElement("div");
    mark.textContent = state.error ? "!" : "U";
    Object.assign(mark.style, {
      width: "48px",
      height: "48px",
      margin: "0 auto 20px",
      display: "grid",
      placeItems: "center",
      borderRadius: "14px",
      background: state.error ? "#fef2f2" : "#dc2626",
      color: state.error ? "#b91c1c" : "#ffffff",
      fontSize: "22px",
      fontWeight: "800",
    });

    const heading = document.createElement("h1");
    heading.textContent = state.title;
    Object.assign(heading.style, { margin: "0", fontSize: "24px", lineHeight: "1.2" });

    const copy = document.createElement("p");
    copy.textContent = state.message;
    Object.assign(copy.style, {
      margin: "12px 0 0",
      color: "#78716c",
      fontSize: "14px",
      lineHeight: "1.6",
    });

    card.append(mark, heading, copy);
    document.body.append(card);
  } catch {
    // The tab may navigate or close while the API request completes.
  }
}
