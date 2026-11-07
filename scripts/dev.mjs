#!/usr/bin/env node
/**
 * ClementIQ one-command dev launcher:  npm run dev   (add -- --worker to also run the monitoring worker)
 *
 * Starts the FastAPI backend (port 8000) and the Next.js frontend (port 3000) together,
 * prefixes their logs, and stops both on Ctrl+C or when either one exits.
 * No extra dependencies — plain Node.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "services", "api");
const isWin = process.platform === "win32";
const PY = path.join(API_DIR, ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python");
const withWorker = process.argv.includes("--worker");

const C = { api: "\x1b[33m", web: "\x1b[36m", worker: "\x1b[35m", dim: "\x1b[2m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", reset: "\x1b[0m" };
const say = (msg) => console.log(`${C.bold}[clementiq]${C.reset} ${msg}`);

/** A port is "in use" if anything accepts a connection on it (IPv4 or IPv6 loopback).
 *  Connecting is more reliable than a test bind on Windows, where binding 0.0.0.0 can succeed
 *  even while another server holds 127.0.0.1 on the same port. */
function accepts(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(700, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

async function portFree(port) {
  const [v4, v6] = await Promise.all([accepts(port, "127.0.0.1"), accepts(port, "::1")]);
  return !v4 && !v6;
}

function pidOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      const line = out.split(/\r?\n/).find((l) => new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING`).test(l));
      return line?.trim().split(/\s+/).pop() ?? null;
    }
    return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

const children = [];
let stopping = false;

function run(name, cmd, args, cwd) {
  // npm is a .cmd shim on Windows and needs a shell; pass it as one command string (no unescaped args).
  const useShell = cmd === "npm";
  const child = useShell
    ? spawn([cmd, ...args].join(" "), { cwd, shell: true, detached: !isWin, env: { ...process.env, FORCE_COLOR: "1" } })
    : spawn(cmd, args, { cwd, detached: !isWin, env: { ...process.env, FORCE_COLOR: "1" } });
  children.push(child);
  const prefix = `${C[name]}[${name}]${C.reset} `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) {
        out.write(prefix + l + "\n");
        if (name === "web" && /Ready in/.test(l)) say(`${C.green}Open http://localhost:3000${C.reset}  (Ctrl+C stops everything)`);
      }
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      say(`${C.red}${name} exited (code ${code}) — stopping the rest.${C.reset}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    try {
      // Kill the whole process tree (uvicorn --reload and next dev spawn sub-processes).
      if (isWin) execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else process.kill(-c.pid, "SIGTERM");
    } catch {
      try { c.kill("SIGTERM"); } catch { /* already gone */ }
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => { say("Stopping…"); shutdown(0); });
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!existsSync(PY)) {
    say(`${C.red}Python virtual environment not found at ${PY}${C.reset}`);
    say("Set it up once with:");
    console.log(`  cd services/api\n  python -m venv .venv\n  ${isWin ? ".venv\\Scripts\\pip" : ".venv/bin/pip"} install -r requirements-dev.txt\n  ${isWin ? ".venv\\Scripts\\python" : ".venv/bin/python"} -m clementiq.cli migrate\n  ${isWin ? ".venv\\Scripts\\python" : ".venv/bin/python"} -m clementiq.cli import`);
    process.exit(1);
  }
  if (!existsSync(path.join(ROOT, "node_modules"))) {
    say(`${C.red}node_modules missing — run "npm install" in the repo root first.${C.reset}`);
    process.exit(1);
  }
  const busy = [];
  for (const port of [8000, 3000]) if (!(await portFree(port))) busy.push(port);
  if (busy.length) {
    for (const port of busy) {
      const pid = pidOnPort(port);
      say(`${C.red}Port ${port} is already in use${pid ? ` by process ${pid}` : ""}.${C.reset}`);
    }
    say(`Probably an older ClementIQ run. Free the ports with:  ${C.bold}npm run stop${C.reset}   then run  ${C.bold}npm run dev${C.reset}  again.`);
    process.exit(1);
  }

  say(`Starting backend (http://127.0.0.1:8000, docs at /api/docs) and frontend (http://localhost:3000)${withWorker ? " + worker" : ""}…`);
  run("api", PY, ["-m", "uvicorn", "clementiq.main:app", "--reload", "--port", "8000"], API_DIR);
  run("web", "npm", ["--workspace", "apps/web", "run", "dev"], ROOT);
  if (withWorker) run("worker", PY, [path.join(ROOT, "services", "worker", "worker.py")], API_DIR);
}

/** `npm run stop`: stop whatever listens on 8000/3000, including orphaned children.
 *  On Windows, uvicorn --reload's worker can keep the socket after its parent exits, and
 *  netstat then reports the dead parent's PID — so children of that PID are stopped too. */
function stopPorts() {
  let stopped = 0;
  for (const port of [8000, 3000]) {
    const pid = pidOnPort(port);
    if (!pid) { say(`Port ${port}: free`); continue; }
    const targets = new Set([pid]);
    if (isWin) {
      try {
        const kids = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}').ProcessId"`, { encoding: "utf8" });
        kids.split(/\s+/).filter(Boolean).forEach((k) => targets.add(k));
      } catch { /* no children */ }
    }
    for (const t of targets) {
      try {
        if (isWin) execSync(`taskkill /pid ${t} /T /F`, { stdio: "ignore" });
        else process.kill(Number(t), "SIGTERM");
        stopped += 1;
      } catch { /* already gone */ }
    }
    say(`Port ${port}: stopped process ${[...targets].join(", ")}`);
  }
  return stopped;
}

if (process.argv.includes("--stop")) {
  stopPorts();
  setTimeout(async () => {
    const still = [];
    for (const port of [8000, 3000]) if (!(await portFree(port))) still.push(port);
    say(still.length ? `${C.red}Still in use: ${still.join(", ")} — close any other terminal running ClementIQ.${C.reset}` : `${C.green}Ports 8000 and 3000 are free. Run: npm run dev${C.reset}`);
  }, 800);
} else {
  main();
}
