import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const backendDir = path.resolve("../backend"); // <-- ajuste se seu django não estiver em /backend
const isWin = process.platform === "win32";

const venvDir = path.join(backendDir, "venv");
const venvPython = isWin
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

if (!existsSync(venvPython)) {
  console.error(
    `❌ Virtualenv não encontrado em: ${venvDir}\n` +
    `Crie o venv primeiro:\n` +
    `  cd backend\n` +
    `  python -m venv .venv\n` +
    `  .venv\\Scripts\\python -m pip install -r requirements.txt  (Windows)\n` +
    `  .venv/bin/python -m pip install -r requirements.txt       (Linux/Mac)\n`
  );
  process.exit(1);
}

const cmd = venvPython;
const args = ["manage.py", "runserver", "0.0.0.0:8000"]; // ajuste porta se quiser

const child = spawn(cmd, args, {
  cwd: backendDir,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => process.exit(code ?? 0));
