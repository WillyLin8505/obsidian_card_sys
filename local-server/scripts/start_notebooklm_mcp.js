import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { spawn, spawnSync } from 'child_process';

const MCP_VERSION = '2.0.0';
const INSTALL_DIR = process.env.NOTEBOOKLM_MCP_DIR || '/tmp/notebooklm-auth';
const PACKAGE_DIR = join(INSTALL_DIR, 'node_modules', '@roomi-fields', 'notebooklm-mcp');
const CONTENT_MANAGER = join(PACKAGE_DIR, 'dist', 'content', 'content-manager.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureInstalled() {
  if (existsSync(CONTENT_MANAGER)) return;

  mkdirSync(INSTALL_DIR, { recursive: true });
  console.log(`[notebooklm] installing @roomi-fields/notebooklm-mcp@${MCP_VERSION} into ${INSTALL_DIR}`);
  run('npm', ['install', `@roomi-fields/notebooklm-mcp@${MCP_VERSION}`], { cwd: INSTALL_DIR });
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`NotebookLM MCP patch failed: pattern not found (${label})`);
  }
  return source.replace(search, replacement);
}

function patchUploadDialogHandling() {
  let source = readFileSync(CONTENT_MANAGER, 'utf8');

  source = replaceOnce(
    source,
    `            initialSourceLabels = await this.getAllSourceLabels();`,
    `            // Do not call getAllSourceLabels() here. It forces the Sources panel
            // active and closes any visible dialog, which can cancel NotebookLM's
            // upload dialog immediately after Insert is clicked.
            initialSourceLabels = [];`,
    'initial source labels'
  );

  source = replaceOnce(
    source,
    `                    let detectedSourceName;
                    let detectedSourceId;
                    try {
                        const currentLabels = await this.getAllSourceLabels();
                        detectedSourceName =
                            this.findAddedSourceName(initialSourceLabels, currentLabels) ||
                                this.findAddedSourceName(previousSourceNames, currentLabels);
                        if (detectedSourceName) {
                            for (let i = currentLabels.length - 1; i >= 0; i--) {
                                if (this.normalizeSourceName(currentLabels[i]) ===
                                    this.normalizeSourceName(detectedSourceName)) {
                                    detectedSourceId = \`source-\${i}\`;
                                    break;
                                }
                            }
                        }
                    }
                    catch {
                        // Continue — even without a name, the count signal is enough.
                    }
                    log.success(\`  ✅ Source added (count \${initialSourceCount} → \${currentCountInLoop})\${detectedSourceName ? \` — name: \${detectedSourceName}\` : ''}\`);
                    return {
                        success: true,
                        sourceId: detectedSourceId,
                        sourceName: detectedSourceName ?? sourceName,
                        status: 'ready',
                    };`,
    `                    log.success(\`  ✅ Source added (count \${initialSourceCount} → \${currentCountInLoop})\`);
                    return {
                        success: true,
                        sourceName,
                        status: 'ready',
                    };`,
    'count loop source detection'
  );

  source = replaceOnce(
    source,
    `                        let detectedSourceName;
                        let detectedSourceId;
                        try {
                            const currentLabels = await this.getAllSourceLabels();
                            detectedSourceName =
                                this.findAddedSourceName(initialSourceLabels, currentLabels) ||
                                    this.findAddedSourceName(previousSourceNames, currentLabels);
                            if (detectedSourceName) {
                                let detectedIndex = -1;
                                for (let i = currentLabels.length - 1; i >= 0; i--) {
                                    if (this.normalizeSourceName(currentLabels[i]) ===
                                        this.normalizeSourceName(detectedSourceName)) {
                                        detectedIndex = i;
                                        break;
                                    }
                                }
                                if (detectedIndex >= 0) {
                                    detectedSourceId = \`source-\${detectedIndex}\`;
                                }
                            }
                        }
                        catch {
                            // Continue below and fall back if needed
                        }
                        if (!detectedSourceName) {
                            log.info('  ℹ️  Source count increased, but a stable source name is not available yet');
                        }
                        else {
                            log.info(\`  ℹ️  Detected new source: \${detectedSourceName}\`);
                            log.success(\`  ✅ Source added! Count increased from \${initialSourceCount} to \${currentCount}\`);
                            return {
                                success: true,
                                sourceId: detectedSourceId,
                                sourceName: detectedSourceName,
                                status: 'ready',
                            };
                        }`,
    `                        log.success(\`  ✅ Source added! Count increased from \${initialSourceCount} to \${currentCount}\`);
                        return {
                            success: true,
                            sourceName,
                            status: 'ready',
                        };`,
    'dialog closed source detection'
  );

  writeFileSync(CONTENT_MANAGER, source);
  console.log('[notebooklm] upload dialog patch applied');
}

function startServer() {
  console.log('[notebooklm] starting REST API on http://127.0.0.1:3000');
  const child = spawn('npm', ['run', 'start:http'], {
    cwd: PACKAGE_DIR,
    env: {
      ...process.env,
      HTTP_HOST: process.env.HTTP_HOST || '127.0.0.1',
      HTTP_PORT: process.env.HTTP_PORT || '3000',
    },
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', code => process.exit(code || 0));
}

mkdirSync(dirname(INSTALL_DIR), { recursive: true });
ensureInstalled();
patchUploadDialogHandling();
startServer();
