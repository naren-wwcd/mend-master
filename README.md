# Mend

Mend is a self-healing operations sandbox. A watcher opens an incident when the
demo shop starts failing, an agent diagnoses it, a guard decides which fixes may
run, and people approve the risky ones. Everything runs locally.

This guide covers how to set it up and run it.

## What you need

| Tool | Version | Used for |
|------|---------|----------|
| Python | 3.10 or newer | backend, sandbox, portal, portal bot |
| Node.js | 18 or newer | the web UI |
| Microsoft Edge | any recent | the portal bot on Windows (it drives Edge) |

On macOS and Linux the portal bot uses the Chromium that Playwright downloads
during setup, so Edge is not needed there.

## Quick start

### Windows

From the project folder:

```bat
run.bat
```

### macOS and Linux

```bash
./run.sh
```

`run.sh` expects a Unix-style virtual environment, so on Windows use `run.bat`
even if you work in Git Bash.

Either script does the full setup and then starts everything:

1. creates `.venv` and installs `requirements.txt`
2. downloads the Playwright browser
3. creates the database and seeds the fix catalog
4. runs `npm install` in `frontend/`
5. starts the five services listed below

The first run takes a few minutes. Press `Ctrl+C` in that window to stop all of
them.

Then open **http://127.0.0.1:5173**.

## What gets started

| Service | Address | What it is |
|---------|---------|------------|
| Web UI | http://127.0.0.1:5173 | landing page, sign-in and the operations console |
| Backend API | http://127.0.0.1:8000 | watcher, agent, guard, event stream |
| Sandbox shop | http://127.0.0.1:8001 | the demo service that faults are injected into |
| Ticket portal | http://127.0.0.1:8002 | legacy service desk the bot files tickets in |
| Portal bot | no port | works through queued portal tasks in a browser |

All four ports must be free. If something is already using one, that service
will not start.

## Signing in

Sign-in is a local demo: workspaces, the session and the access log live in your
browser's storage, and the backend API is not authenticated. Do not reuse it for
anything real.

Use the seeded account:

| Field | Value |
|-------|-------|
| Workspace | `acme` (also `northwind`, `globex`) |
| Email | `ops@mend.test` |
| Password | `mend-demo` |

Or open the **Create workspace** tab and make your own.

## Trying it out

1. Sign in and stay on the **Overview** tab.
2. Under **Break the sandbox**, click a fault, for example **Bad config**.
3. The console switches to the **Incident** tab. Watch the agent investigate,
   record hypotheses, and propose a fix.
4. Low-risk fixes run on their own. For a high-risk one, such as **DB hung**, an
   approval dialog appears: approve or reject it.
5. The incident ends as **resolved** or, if nothing safe works, **escalated**.
   **Payment down** always escalates; no catalog fix applies to it.
6. Meanwhile the portal bot opens a browser, files the ticket in the portal and
   updates it. Its screenshots are saved in `screenshots/`.
7. **Reset sandbox** on the Overview tab clears the fault and all incidents.

## Running the services yourself

Use this if you want each service in its own terminal, or the scripts do not
suit your setup.

One-time setup:

```bash
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
python -m scripts.seed
npm --prefix frontend install
```

Then start each of these in a separate terminal, from the project folder with
the virtual environment active:

```bash
python -m uvicorn sandbox_app.main:app --host 127.0.0.1 --port 8001
python -m uvicorn backend.api:app      --host 127.0.0.1 --port 8000
python -m uvicorn itsm_portal.app:app  --host 127.0.0.1 --port 8002
python -m rpa.worker
npm --prefix frontend run dev
```

Start the sandbox before the backend; the backend waits up to 30 seconds for it.

## Settings

Everything works with no configuration. To change something, set the variable
in the terminal before starting the services.

| Variable | Default | Meaning |
|----------|---------|---------|
| `GEMINI_API_KEY` | empty | set it to let a live model drive the agent |
| `GEMINI_MODEL` | `gemini-2.0-flash` | model used when a key is set |
| `LLM_MODE` | `auto` | `auto` uses the live model if a key is set, otherwise replay; `replay` forces recorded traces |
| `ERROR_RATE_THRESHOLD` | `0.05` | error rate above which the watcher opens an incident |
| `BREVO_SMTP_HOST` / `BREVO_SMTP_PORT` | `smtp-relay.brevo.com` / `587` | Brevo SMTP relay for incident email alerts |
| `BREVO_SMTP_USER` / `BREVO_SMTP_KEY` | unset | Brevo SMTP login and SMTP key |
| `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | unset | verified sender and alert recipient addresses |
| `RPA_HEADLESS` | `false` | `true` runs the portal bot without showing browser windows |
| `RPA_SLOW_MO_MS` | `400` | delay between bot actions, so they can be followed on screen |
| `RPA_BROWSER_CHANNEL` | `msedge` on Windows | browser the bot drives; empty uses Playwright's Chromium |
| `RPA_MAX_ATTEMPTS` | `3` | tries per portal task before it is marked failed |
| `SANDBOX_URL` | `http://127.0.0.1:8001` | where the backend finds the sandbox |
| `PORTAL_URL` | `http://127.0.0.1:8002` | where the bot finds the portal |
| `PORTAL_USER` / `PORTAL_PASS` | `autoheal_bot` / `sandbox-demo-password` | portal login; the portal and the bot must agree |
| `DB_PATH` | `data/autoheal.db` | backend database |
| `ITSM_DB_PATH` | `data/itsm_portal.db` | portal database |
| `SCREENSHOT_DIR` | `screenshots` | where bot screenshots are written and served from |

Without a `GEMINI_API_KEY` the agent runs in **replay** mode: it follows a
recorded investigation from `traces/` but still calls the real sandbox tools, so
fixes and verification are genuine.

`.env.example` lists the common variables. The backend reads the root `.env`.
Fill in the Brevo SMTP login, SMTP key, verified sender address, and recipient
in `.env` to receive an email when the watcher opens an incident. Placeholder
values are ignored, so email stays disabled until you replace them.

## Tests

```bash
# Backend (about a minute; starts its own sandbox on port 8011)
python -m pytest

# Frontend
npm --prefix frontend test
```

Run only one backend test session at a time: they share port 8011.

Build the UI for production with `npm --prefix frontend run build`.

## Troubleshooting

**A service does not start, or the UI says "Port 5173 is already in use".**
Another copy is still running. Stop it, or find it with
`netstat -ano | findstr :5173` (Windows) or `lsof -i :5173` (macOS / Linux).

**Browser windows keep opening and closing.**
That is the portal bot working through its queue. Set `RPA_HEADLESS=true` to hide
it. If it is draining a backlog you do not want, click **Reset sandbox**.

**The console shows "Backend unavailable" or stays empty.**
The backend on port 8000 is not running or is still starting. Check its
terminal for errors.

**An incident stays escalated and no new one opens.**
That is intended: one incident is opened per outage. Inject a new fault or click
**Reset sandbox** to start again.

**The portal bot fails at launch on macOS or Linux.**
Run `python -m playwright install chromium`, and make sure
`RPA_BROWSER_CHANNEL` is not set to `msedge`.

**Starting clean.**
Stop everything, then delete `data/`, `screenshots/` and `logs/`. They are
recreated on the next start. To clear sign-in data, clear the site's storage in
your browser.

## Project layout

```
backend/       API, watcher, agent, guard, verification, escalation
sandbox_app/   demo shop service with injectable faults
itsm_portal/   legacy ticket portal
rpa/           portal bot and its task queue worker
frontend/      web UI (Vite, React)
traces/        recorded investigations used in replay mode
scripts/       database seed and demo helpers
tests/         backend tests
```
