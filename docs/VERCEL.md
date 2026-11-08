# Minimal deployment on Vercel

Deploy the repository root, not apps/web. Vercel Services (beta) builds the existing Next.js web and FastAPI api together; /api/* goes to FastAPI and all other paths go to Next.js. No new runtime dependency or financial formula is introduced.

Project: clementiq-minimal, team portfolio-yuntaolu, source ui-redesign.

Before releasing the services deployment:
- Provision an empty PostgreSQL database dedicated to this demo. Set DATABASE_URL in the root local .env and in the Vercel project environment, using postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require. Use the pooler URL for Vercel if the provider supplies one. Do not commit credentials.
- In Vercel set CLEMENTIQ_ENV=production and a fresh random JWT_SECRET; configure access codes. Set GEMINI_API_KEY only on the server if AI is required. No NEXT_PUBLIC_ secret variables.
- From services/api run .venv/Scripts/python.exe -m clementiq.cli migrate, then .venv/Scripts/python.exe -m clementiq.cli import. These use the existing importer and supplied CSV/gzip data. Run only against the dedicated database.
- In Vercel set Root Directory to the repository root and Application Preset to Services. Remove the old single-frontend build overrides. The root vercel.json owns routing. API_PROXY_TARGET is unnecessary for this deployment.
- Deploy the ui-redesign commit and check /api/health, /api/auth/demo-login, /api/auth/me and a scoped account summary. Verify saved scenarios survive a fresh session.

The old frontend-only deployment can render /login but cannot authenticate because /api/auth/demo-login has no backend. A public login page alone is not a working full-stack deployment.
