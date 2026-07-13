# Authenticated UI validation

- For UI validation, use the user's existing Chrome session through the Codex Chrome extension.
- Do not use the in-app Browser for authenticated application routes.
- Run the frontend locally at `http://localhost:5173` against `https://api.unvelar.com`.
- Do not start a local API or connect a local API to the production database for frontend-only changes.
- Open the local frontend in Chrome. If localhost is unauthenticated, use the normal WorkOS sign-in flow in Chrome so the existing SSO session can be reused.
- Treat production-backed validation as read-only by default. Do not create, update, delete, upload, send email, or trigger jobs unless explicitly authorized by the user.
- If the Chrome extension is unavailable or authentication requires user interaction, stop and ask the user to connect or sign in. Do not silently fall back to the in-app Browser.
- After frontend changes, validate the changed flow in Chrome and report what was tested, including any console or network errors.
