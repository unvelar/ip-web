import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import App, { AdminRoute } from "../src/App";
import AppShell from "../src/components/AppShell";
import AdminLlmActivity from "../src/pages/AdminLlmActivity";
import "../src/index.css";

// Review the worktree against the deployed API on the user's existing dev server.
// Reuse the application's auth gate, shell, session store, and navigation.
createRoot(document.getElementById("root")!).render(<BrowserRouter><AuthProvider><Routes>
  <Route element={<AdminRoute><AppShell /></AdminRoute>}>
    <Route path="/__llm-prototype/prototypes/llm-activity.html" element={<AdminLlmActivity />} />
  </Route>
  <Route path="*" element={<App />} />
</Routes></AuthProvider></BrowserRouter>);
