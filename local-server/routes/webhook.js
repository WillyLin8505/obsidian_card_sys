import { createHmac, timingSafeEqual } from 'crypto';
import { execFile } from 'child_process';
import { Router } from 'express';

const router = Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PROJECT_DIR = process.env.PROJECT_DIR || '/home/sssss/Card_Box_Note_Management';

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true;
  const expected = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post('/', (req, res) => {
  const signature = req.headers['x-hub-signature-256'] || '';

  if (WEBHOOK_SECRET && !verifySignature(req.rawBody, signature)) {
    console.warn('[webhook] invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.json({ ok: true, skipped: true, event });
  }

  let payload;
  try {
    payload = JSON.parse(req.rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (payload.ref !== 'refs/heads/main') {
    return res.json({ ok: true, skipped: true, reason: `branch: ${payload.ref}` });
  }

  console.log(`[webhook] push to main by ${payload.pusher?.name} — running git pull`);

  execFile('git', ['pull', '--ff-only'], { cwd: PROJECT_DIR }, (err, stdout, stderr) => {
    if (err) {
      console.error('[webhook] git pull failed:', stderr);
      return res.status(500).json({ error: stderr.trim() });
    }
    console.log('[webhook] git pull:', stdout.trim());
    res.json({ ok: true, output: stdout.trim() });
  });
});

export default router;
