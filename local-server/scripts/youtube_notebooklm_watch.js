import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = join(SERVER_DIR, 'config/youtube-watch.json');
const EXAMPLE_CONFIG_PATH = join(SERVER_DIR, 'config/youtube-watch.example.json');
const DEFAULT_STATE_PATH = join(SERVER_DIR, 'data/youtube-watch-state.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || process.env.YOUTUBE_WATCH_DRY_RUN === '1';
const processExisting = args.has('--process-existing') || process.env.YOUTUBE_WATCH_PROCESS_EXISTING === '1';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeJsonStringFragment(value = '') {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\u0026/g, '&').replace(/\\"/g, '"');
  }
}

function firstEnvList(name) {
  return (process.env[name] || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)[0] || '';
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function sanitizeFilename(value) {
  return String(value || 'Untitled')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function videoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CardBoxNoteManagement/1.0 YouTube watcher',
      'Accept': 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.text();
}

function channelIdFromUrl(url) {
  const text = String(url || '');
  const direct = text.match(/(?:youtube\.com\/channel\/|channel_id=)(UC[\w-]{20,})/i);
  return direct?.[1] || '';
}

async function resolveChannelId(source) {
  if (source.channelId) return source.channelId;
  const direct = channelIdFromUrl(source.url);
  if (direct) return direct;
  if (!source.url) throw new Error(`Missing url/channelId for source: ${source.name || '(unnamed)'}`);

  const html = await fetchText(source.url);
  return (
    html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1] ||
    html.match(/<meta itemprop="channelId" content="(UC[\w-]{20,})"/)?.[1] ||
    html.match(/youtube\.com\/channel\/(UC[\w-]{20,})/)?.[1] ||
    ''
  );
}

function parseYouTubeFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
  return entries.map(entry => {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';
    const updated = entry.match(/<updated>([^<]+)<\/updated>/)?.[1] || '';
    const channelTitle = decodeXml(entry.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/)?.[1] || '');
    const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || (videoId ? videoUrl(videoId) : '');
    return { videoId, title, published, updated, channelTitle, url: decodeXml(link) };
  }).filter(video => video.videoId && video.title);
}

async function videoTitleFromOembed(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(videoId))}&format=json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CardBoxNoteManagement/1.0 YouTube watcher' },
  });
  if (!response.ok) return '';
  const data = await response.json().catch(() => ({}));
  return data.title || '';
}

async function parseVideosPage(html, source) {
  const videoIds = [];
  const seen = new Set();
  const re = /"videoId":"([^"]+)"/g;
  for (const match of html.matchAll(re)) {
    const videoId = match[1];
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    videoIds.push(videoId);
    if (videoIds.length >= 15) break;
  }

  const videos = [];
  for (const videoId of videoIds) {
    const title = await videoTitleFromOembed(videoId);
    if (!title) continue;
    videos.push({
      videoId,
      title,
      published: '',
      updated: '',
      channelTitle: source.name || '',
      url: videoUrl(videoId),
    });
  }
  return videos;
}

async function latestVideosForSource(source) {
  const channelId = await resolveChannelId(source);
  if (!channelId) throw new Error(`Cannot resolve YouTube channel ID for ${source.url || source.name}`);
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let videos = [];
  try {
    videos = parseYouTubeFeed(await fetchText(feedUrl));
  } catch (err) {
    const channelUrl = source.url || `https://www.youtube.com/channel/${channelId}`;
    const videosUrl = channelUrl.replace(/\/$/, '') + '/videos';
    console.warn(`[warn] RSS failed for ${source.name || channelId}: ${err.message}; falling back to ${videosUrl}`);
    videos = await parseVideosPage(await fetchText(videosUrl), source);
  }
  return { channelId, videos };
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `${path} failed: ${response.status}`);
  }
  return data;
}

async function summarizeWithNotebookLm(config, video) {
  const notebookLmUrl = normalizeBaseUrl(config.notebookLmApiUrl || process.env.NOTEBOOKLM_API_URL || 'http://127.0.0.1:3000');
  const notebookUrl = config.notebookUrl || process.env.NOTEBOOKLM_NOTEBOOK_URL || '';
  const common = notebookUrl ? { notebook_url: notebookUrl } : {};

  await postJson(notebookLmUrl, '/content/sources', {
    source_type: 'youtube',
    url: video.url,
    title: video.title,
    ...common,
  });

  const question = config.summaryQuestion || process.env.YOUTUBE_SUMMARY_QUESTION || [
    '請用繁體中文整理剛新增的 YouTube 影片。',
    '請輸出：1. 核心摘要 2. 重要觀點 3. 可行動建議 4. 適合連結到的知識主題。',
    `影片標題：${video.title}`,
    `影片網址：${video.url}`,
  ].join('\n');

  const answer = await postJson(notebookLmUrl, '/ask', {
    question,
    source_format: 'footnotes',
    ...common,
  });

  return answer.data?.answer || answer.answer || JSON.stringify(answer.data || answer, null, 2);
}

function buildNoteContent(video, summary) {
  const createdAt = new Date().toISOString();
  const title = video.title.replace(/"/g, '\\"');
  return `---\ntitle: "${title}"\nsource: "${video.url}"\nyoutube_video_id: "${video.videoId}"\nyoutube_channel: "${video.channelTitle.replace(/"/g, '\\"')}"\npublished: "${video.published}"\ncreated: "${createdAt}"\ntags:\n  - YouTube\n  - NotebookLM\n---\n\n# ${video.title}\n\n- 頻道：${video.channelTitle || '未知'}\n- 發布時間：${video.published || video.updated || '未知'}\n- 影片連結：${video.url}\n\n# NotebookLM 摘要\n\n${summary.trim()}\n`;
}

async function writeNote(config, video, summary) {
  const rawVaultPath = config.vaultPath || process.env.OBSIDIAN_VAULT_PATH || firstEnvList('OBSIDIAN_VAULT_PATHS');
  if (!rawVaultPath) throw new Error('Missing vaultPath. Set it in config or OBSIDIAN_VAULT_PATHS.');
  const vaultPath = resolve(rawVaultPath);

  const folder = config.noteFolder || process.env.YOUTUBE_NOTE_FOLDER || 'YouTube 摘要';
  const day = (video.published || new Date().toISOString()).slice(0, 10);
  const filename = `${day} ${sanitizeFilename(video.title)} [${video.videoId}].md`;
  const filePath = join(vaultPath, folder, filename);

  if (dryRun) {
    console.log(`[dry-run] would write note: ${filePath}`);
    return filePath;
  }

  await mkdir(dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    console.log(`[skip] note already exists: ${filePath}`);
    return filePath;
  }
  await writeFile(filePath, buildNoteContent(video, summary), { encoding: 'utf8', flag: 'wx' });
  return filePath;
}

async function run() {
  const configPath = resolve(process.env.YOUTUBE_WATCH_CONFIG || DEFAULT_CONFIG_PATH);
  const statePath = resolve(process.env.YOUTUBE_WATCH_STATE || DEFAULT_STATE_PATH);
  const config = await readJson(configPath, null);
  if (!config) {
    throw new Error(`No config found. Copy ${EXAMPLE_CONFIG_PATH} to ${configPath} and edit sources.`);
  }
  const sources = Array.isArray(config.sources) ? config.sources : [];
  if (sources.length === 0) {
    throw new Error(`No YouTube sources configured. Edit ${configPath}`);
  }

  const state = await readJson(statePath, { seenVideoIds: {}, lastRunAt: null });
  state.seenVideoIds ||= {};
  const isFirstRun = !state.lastRunAt && Object.keys(state.seenVideoIds).length === 0;
  let created = 0;

  for (const source of sources) {
    const { channelId, videos } = await latestVideosForSource(source);
    state.seenVideoIds[channelId] ||= [];
    const seen = new Set(state.seenVideoIds[channelId]);
    const maxNewVideos = Number(source.maxNewVideos || config.maxNewVideos || 3);
    const newVideos = videos.filter(video => !seen.has(video.videoId)).slice(0, maxNewVideos);

    if (isFirstRun && !processExisting) {
      state.seenVideoIds[channelId] = [...new Set([...state.seenVideoIds[channelId], ...videos.map(v => v.videoId)])];
      console.log(`[seed] ${source.name || channelId}: marked ${videos.length} existing videos as seen`);
      continue;
    }

    for (const video of newVideos.reverse()) {
      console.log(`[new] ${video.title} ${video.url}`);
      const summary = dryRun
        ? 'DRY RUN: NotebookLM summary would be generated here.'
        : await summarizeWithNotebookLm(config, video);
      const notePath = await writeNote(config, video, summary);
      console.log(`[saved] ${notePath}`);
      seen.add(video.videoId);
      created++;
    }
    state.seenVideoIds[channelId] = [...seen].slice(-200);
  }

  state.lastRunAt = new Date().toISOString();
  if (!dryRun) await writeJson(statePath, state);
  console.log(`[done] created ${created} notes`);
}

run().catch(err => {
  console.error(`[youtube-watch] ${err.message}`);
  process.exit(1);
});
