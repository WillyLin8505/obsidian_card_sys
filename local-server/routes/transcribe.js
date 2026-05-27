import { Router } from 'express';

const router = Router();
const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';

// ── Audio energy gate ─────────────────────────────────────────────
// WAV = 44-byte header + 16-bit LE PCM samples.
// If the overall RMS is below threshold, the audio is silence/noise —
// skip STT entirely instead of letting Whisper hallucinate.
const WAV_RMS_THRESHOLD = 0.015;

function wavRms(buffer) {
  if (buffer.length < 46) return 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 44; i + 1 < buffer.length; i += 2) {
    const s = buffer.readInt16LE(i) / 32768;
    sumSq += s * s;
    count++;
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

// ── Provider implementations ───────────────────────────────────────

async function transcribeFunasr(buffer, contentType) {
  const response = await fetch(`${SEARCH_SERVER_URL}/transcribe`, {
    method: 'POST',
    body: buffer,
    headers: { 'content-type': contentType },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw Object.assign(new Error(err.detail || 'Transcription failed'), { status: response.status });
  }
  return response.json(); // { text }
}

async function transcribeWhisper(buffer, { endpoint, apiKey, model, language = 'zh' }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw Object.assign(new Error(err.error?.message || 'Transcription failed'), { status: response.status });
  }
  const data = await response.json();
  return { text: data.text };
}

// ── Route ─────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) return res.status(400).json({ error: '未收到音訊' });

  const contentType = req.get('content-type') || 'audio/wav';
  const provider = (process.env.ASR_PROVIDER || 'funasr').toLowerCase();

  if (wavRms(buffer) < WAV_RMS_THRESHOLD) {
    return res.json({ text: '' });
  }

  try {
    let result;

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY 未設定' });
      result = await transcribeWhisper(buffer, {
        endpoint: 'https://api.openai.com/v1/audio/transcriptions',
        apiKey,
        model: 'whisper-1',
      });

    } else if (provider === 'groq') {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY 未設定' });
      result = await transcribeWhisper(buffer, {
        endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey,
        model: 'whisper-large-v3',
      });

    } else {
      result = await transcribeFunasr(buffer, contentType);
    }

    res.json(result);
  } catch (err) {
    console.error(`[transcribe/${provider}]`, err.message);
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      return res.status(503).json({ error: '搜尋伺服器未啟動。' });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
