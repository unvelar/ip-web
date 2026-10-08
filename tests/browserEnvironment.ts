import { Window } from "happy-dom";

// Browser singletons must see storage before any application module imports.
// Individual component suites can still install their own document and URL.
const browserWindow = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, {
  window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator,
  localStorage: browserWindow.localStorage, sessionStorage: browserWindow.sessionStorage,
  HTMLElement: browserWindow.HTMLElement, Element: browserWindow.Element, Node: browserWindow.Node,
  Event: browserWindow.Event, MouseEvent: browserWindow.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
