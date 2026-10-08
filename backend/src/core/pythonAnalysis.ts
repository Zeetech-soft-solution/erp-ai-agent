import { spawn } from "child_process";
import path from "path";

/**
 * Runs one Python analysis (backend/analytics/<name>.py) as a child
 * process: rows in on stdin, JSON result out on stdout. Keeps the agent a
 * single deployment; a hosted platform can run the same scripts as a
 * separate Python service without changing them. The rows go to Python,
 * never to the language model; the model only sees the returned summary.
 */
export const ANALYTICS_DIR = path.resolve(__dirname, "../../analytics");

export function runPythonAnalysis(
  name: string,
  rows: object[],
  opts: { command?: string; args?: string[]; timeoutMs?: number } = {}
): Promise<any> {
  if (!/^[a-z0-9_]+$/.test(name)) return Promise.reject(new Error(`Invalid analysis name "${name}"`));
  const command = opts.command ?? (process.env.PYTHON_BIN || "python3");
  const args = opts.args ?? [path.join(ANALYTICS_DIR, `${name}.py`)];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { timeout: opts.timeoutMs ?? 30000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`Could not start the analytics engine (${command}): ${e.message}`)));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Analysis "${name}" failed: ${err.trim() || `exit code ${code}`}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`Analysis "${name}" returned invalid JSON`));
      }
    });
    child.stdin.end(JSON.stringify({ rows }));
  });
}
