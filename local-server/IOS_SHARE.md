# iOS Share Sheet to Literature Notes

This setup lets iOS share a URL into Card Box literature notes through a Cloudflare Tunnel.

## Local Services

Start the local server:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run dev
```

Start the iOS share gateway:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run ios-share:gateway
```

Start the Cloudflare quick tunnel:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run ios-share:tunnel
```

Copy the generated `https://*.trycloudflare.com` URL from the tunnel output.

## Endpoint

Use this endpoint in iOS Shortcuts:

```text
POST https://YOUR-TUNNEL.trycloudflare.com/literature-note
```

Headers:

```text
Content-Type: application/json
x-ios-share-token: <IOS_SHARE_TOKEN from local-server/.env>
```

JSON body:

```json
{
  "url": "Shortcut Input"
}
```

The API analyzes the URL using the existing `/fetch-url` flow. YouTube links go through NotebookLM. The final Markdown file is saved under:

```text
/mnt/d/obsidian/Willy_2026/Sources/inbox
```

Override the folder with:

```env
IOS_SHARE_SOURCE_NOTE_DIR=Sources/inbox
```

## iOS Shortcut

1. Create a new Shortcut.
2. Enable `Show in Share Sheet`.
3. Accepted input: `URLs`.
4. Add `Get Contents of URL`.
5. URL: `https://YOUR-TUNNEL.trycloudflare.com/literature-note`.
6. Method: `POST`.
7. Headers:
   - `Content-Type`: `application/json`
   - `x-ios-share-token`: value from `local-server/.env`.
8. Request body: JSON with `url` set to the Shortcut Input.
9. Optional: add `Show Notification` with `已加入文獻筆記`.

For apps such as Threads, `Shortcut Input` may be a rich share object instead of a plain URL.
Use this safer sequence before `Get Contents of URL`:

```text
Get URLs from Shortcut Input
Get Item from List: First Item
Get Contents of URL
  Request body JSON:
    url: Item from List
```

If `Get URLs from Shortcut Input` returns empty, add `Get Text from Shortcut Input`
and then `Match Text` with:

```text
https?://\S+
```

Use the first matched result as the JSON `url`.

## Debug Without Creating Notes

Use the debug endpoint to check what URL the server can extract without running AI analysis:

```text
POST https://YOUR-TUNNEL.trycloudflare.com/debug-extract-url
```

Use the same headers and JSON body as `/literature-note`. The response includes:

```json
{
  "ok": true,
  "extractedUrl": "https://...",
  "candidates": ["https://..."],
  "bodyKeys": ["url"],
  "received": { "url": "..." }
}
```

Local simulator:

```bash
cd /home/sssss/Card_Box_Note_Management/local-server
npm run ios-share:simulate -- text
npm run ios-share:simulate -- object
npm run ios-share:simulate -- empty
```

Custom payload:

```bash
npm run ios-share:simulate -- --json '{"url":"Threads text https://www.threads.net/@example/post/ABC123"}'
```

## Security

The Cloudflare Tunnel points only to `ios-share-gateway` on port `3010`, not to the full local server. The gateway exposes only:

```text
GET /health
POST /literature-note
POST /ios-share/literature-note
POST /debug-extract-url
POST /ios-share/debug-extract-url
```

All write actions require `IOS_SHARE_TOKEN`.
