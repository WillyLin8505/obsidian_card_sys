# Card Box App over Cloudflare Tunnel

This exposes the Card Box web app through one protected local gateway.

Do not tunnel these services directly:

```text
127.0.0.1:3000  NotebookLM MCP
127.0.0.1:3001  local-server
```

Tunnel only:

```text
127.0.0.1:3020  app-gateway
```

## Environment

Create or update `local-server/.env`:

```env
HOST=127.0.0.1
PORT=3001
LOCAL_SERVER_TOKEN=replace-with-a-long-random-local-server-token
OBSIDIAN_VAULT_PATHS=/mnt/d/obsidian/Willy_2026

NOTEBOOKLM_API_URL=http://127.0.0.1:3000

APP_GATEWAY_TOKEN=replace-with-a-long-random-app-token
APP_GATEWAY_HOST=127.0.0.1
APP_GATEWAY_PORT=3020
APP_GATEWAY_FRONTEND_ORIGIN=http://127.0.0.1:5173
APP_GATEWAY_INTERNAL_API_URL=http://127.0.0.1:3001
```

Use long random tokens. For example:

```bash
openssl rand -hex 32
```

## Start Services

Terminal 1, frontend:

```bash
cd /home/sssss/Card_Box_Note_Management
npm run dev
```

Terminal 2, local API:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run dev
```

Terminal 3, NotebookLM MCP:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run notebooklm:start
```

Terminal 4, protected app gateway:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run app:gateway
```

Terminal 5, Cloudflare Quick Tunnel:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run app:tunnel
```

Open the generated `https://*.trycloudflare.com` URL once with:

```text
https://YOUR-TUNNEL.trycloudflare.com/?token=APP_GATEWAY_TOKEN
```

The gateway sets an HttpOnly cookie and then removes the token from the URL.

## How Protection Works

- Cloudflare sees only the app gateway on `3020`.
- The gateway requires `APP_GATEWAY_TOKEN` before serving the app or `/api`.
- Browser API calls go to same-origin `/api`.
- The gateway forwards `/api/*` to local-server `3001`.
- The gateway injects `LOCAL_SERVER_TOKEN` server-side.
- NotebookLM MCP `3000` is never exposed to Cloudflare.

For a permanent domain, configure the same tunnel target:

```text
http://127.0.0.1:3020
```

Then add Cloudflare Access on top and restrict login to your own email.
