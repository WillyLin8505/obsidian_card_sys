import 'dotenv/config';

const endpoint = (process.env.IOS_SHARE_SIMULATE_URL || 'http://127.0.0.1:3010/debug-extract-url').replace(/\/$/, '');
const token = process.env.IOS_SHARE_TOKEN || '';

const presets = {
  url: { url: 'https://www.threads.net/@example/post/ABC123' },
  text: { url: 'Threads 貼文：https://www.threads.net/@example/post/ABC123?x=1' },
  object: {
    url: {
      title: 'Threads post',
      text: '分享文字 https://www.threads.net/@example/post/ABC123',
    },
  },
  empty: { url: '' },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const presetName = args[0] || 'text';
  const jsonArgIndex = args.indexOf('--json');
  if (jsonArgIndex >= 0 && args[jsonArgIndex + 1]) {
    return JSON.parse(args[jsonArgIndex + 1]);
  }
  return presets[presetName] || presets.text;
}

async function main() {
  if (!token) {
    throw new Error('IOS_SHARE_TOKEN is missing in local-server/.env');
  }

  const body = parseArgs();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ios-share-token': token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`POST ${endpoint}`);
  console.log(`HTTP ${response.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
