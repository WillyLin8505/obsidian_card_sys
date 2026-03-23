import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');

/**
 * 呼叫 Python 腳本，傳入 JSON 資料，回傳 JSON 結果。
 * @param {string} scriptName - scripts/ 目錄下的腳本檔名（含 .py）
 * @param {object} inputData - 傳給腳本 stdin 的 JSON 物件
 * @param {number} timeoutMs - 超時毫秒數，預設 30000
 * @returns {Promise<object>} 腳本 stdout 解析後的 JSON
 */
export async function runPythonScript(scriptName, inputData, timeoutMs = 30000) {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      py.kill();
      reject(new Error(`Python script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    py.stdout.on('data', (data) => { stdout += data.toString(); });
    py.stderr.on('data', (data) => { stderr += data.toString(); });

    py.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python script exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Invalid JSON from Python script: ${stdout.trim()}`));
      }
    });

    py.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    py.stdin.write(JSON.stringify(inputData));
    py.stdin.end();
  });
}
