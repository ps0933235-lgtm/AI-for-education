# Learnova AI

Learnova is a vanilla HTML/CSS/JavaScript study site with a small Node.js backend. The backend handles student accounts, password reset tokens, and AI requests. API keys and passwords are never stored in frontend JavaScript or browser local storage.

## Start the server in VS Code

1. Install **Node.js 22.13 or newer**. In the VS Code terminal, `node --version` should print `v22.13.0` or a newer version. If PowerShell says `node` is not recognized, install Node.js and restart VS Code so the terminal reloads PATH.
2. Open this project folder in VS Code, then select **Terminal → New Terminal**.
3. In PowerShell, move to the folder containing `server.js`:

   ```powershell
   Set-Location "C:\Users\PalakSharma\OneDrive\Documents\Ai for eduction"
   ```

4. Confirm Node.js is available:

   ```powershell
   node --version
   ```

5. Start the server for login and signup:

   ```powershell
   node server.js
   ```

   No `.env` file or AI key is required for login/signup. Leave this terminal open. A successful start prints `Learnova is available at http://localhost:3000/`.

To enable AI tools, set `GEMINI_API_KEY` in the server environment and restart Learnova. When both Gemini and OpenAI keys are configured, Learnova uses Gemini. The existing OpenAI integration remains available as a fallback when no Gemini key is set. Keep API keys out of frontend files and never share or commit them.

## Open the website in your browser

With the server still running, open **http://localhost:3000/login.html** to log in or create an account, or **http://localhost:3000** to start at the homepage. Do not open `login.html` or `index.html` directly from File Explorer; the pages need the backend at the same origin.

To check the auth API without entering credentials or changing accounts, run this in a second PowerShell terminal:

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/me" -UseBasicParsing
"$($response.StatusCode) $($response.Content)"
```

When signed out, the expected response is `200 {"student":null}`.

No npm packages need to be installed. SQLite is included with Node.js 22.13+; the server creates `learnova.sqlite` on first run. Node may show its built-in SQLite `ExperimentalWarning`; this is expected for Node’s `node:sqlite` module.
To store that database somewhere else, set `LEARNOVA_DB_PATH` to an absolute file path in the server environment.

## Server troubleshooting

- **`node` is not recognized**: install Node.js 22.13 or newer, close and reopen VS Code, then verify with `node --version`.
- **`ERR_CONNECTION_REFUSED` in the browser**: the server is not running or did not finish starting. Check the VS Code terminal for an error and for `Learnova is available at http://localhost:3000/`; keep that terminal open.
- **`EADDRINUSE` on port 3000**: another process is using the port. Stop that process, or set both `PORT=3001` and `PUBLIC_BASE_URL=http://localhost:3001` in `.env`, restart with `node --env-file=.env server.js`, and open `http://localhost:3001/login.html`.

## Accounts and password reset

- Signup stores a salted, scrypt-hashed password in SQLite.
- Login creates a server-side session and an `HttpOnly`, `SameSite=Strict` cookie. “Remember me” extends the session up to 30 days.
- Learning progress is non-sensitive browser data, stored separately for each student. It is not used to authenticate anyone.
- In local development, the forgot-password page prints a one-time reset link in the server terminal. It expires after 30 minutes and works once.
- For a deployed site, use HTTPS, set `NODE_ENV=production` and `PUBLIC_BASE_URL` to the HTTPS site address, and configure `RESEND_API_KEY` and a verified `RESET_FROM_EMAIL` in the server environment. Do not use the development reset-link behavior on a public server.

## AI tools

Tutor questions, note settings/topics, quiz topics, and flashcard topics are sent to the configured AI provider by the server. Gemini is used when `GEMINI_API_KEY` is set; otherwise, Learnova uses `OPENAI_API_KEY`. Without either key, the AI controls show a setup message. AI-generated content can be wrong, so check important facts with course materials.

Before deploying publicly, add HTTPS, a production hosting setup, database backups, and stronger distributed rate limiting. The included server binds to localhost for local project use.
