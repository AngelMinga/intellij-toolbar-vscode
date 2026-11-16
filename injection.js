// Reactiva sola la inyección de titlebar-inject.js (Custom CSS and JS Loader) cuando falta: en una
// instalación nueva o tras cada actualización de VS Code, que reemplaza workbench.html y la borra.
// Se puede apagar con "intellijToolbar.autoEnableInjection": false.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOADER_ID = 'be5invis.vscode-custom-css';
const MARKER = 'VSCODE-CUSTOM-CSS-START';
const TRIED_KEY = 'ijt.injectionTried';

// Mismas rutas candidatas que el loader (v1.102+ en electron-browser; antes, electron-sandbox).
function workbenchHtml() {
  const base = path.join(vscode.env.appRoot, 'out', 'vs', 'code');
  for (const dir of ['electron-browser/workbench', 'electron-browser', 'electron-sandbox/workbench', 'electron-sandbox']) {
    for (const name of ['workbench.html', 'workbench.esm.html']) {
      const p = path.join(base, dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function injected(html) {
  try { return fs.readFileSync(html, 'utf8').includes(MARKER); } catch { return false; }
}

// El parche se ve solo al arrancar de cero (Reload Window no basta): se cierra VS Code y un proceso
// aparte lo vuelve a abrir cuando ya terminó de cerrarse.
function restartVSCode() {
  const app = path.resolve(vscode.env.appRoot, '..', '..', '..'); // …/Visual Studio Code.app
  if (process.platform === 'darwin' && app.endsWith('.app')) {
    const pid = process.ppid;
    const script = `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done; sleep 1; open "${app}"`;
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
  }
  vscode.commands.executeCommand('workbench.action.quit');
}

async function askRestart(text) {
  const btn = await vscode.window.showInformationMessage(text, 'Reiniciar VS Code', 'Más tarde');
  if (btn === 'Reiniciar VS Code') restartVSCode();
}

async function check(ctx) {
  if (!vscode.workspace.getConfiguration('intellijToolbar').get('autoEnableInjection', true)) return;
  const imports = vscode.workspace.getConfiguration('vscode_custom_css').get('imports') || [];
  if (!imports.some(u => String(u).endsWith('/titlebar-inject.js'))) return;
  if (!vscode.extensions.getExtension(LOADER_ID)) return;
  const html = workbenchHtml();
  if (!html) return;

  if (injected(html)) return;

  // Un intento automático por versión de VS Code; si falló (p. ej. sin permiso para escribir en la app),
  // no se insiste en cada arranque: se ofrece reintentar.
  if (ctx.globalState.get(TRIED_KEY) === vscode.version) {
    const btn = await vscode.window.showWarningMessage(
      'IntelliJ Toolbar: la barra de título no está inyectada. Si macOS lo bloqueó, activa Visual Studio Code en ' +
      'Ajustes del Sistema → Privacidad y seguridad → Gestión de apps y reintenta.', 'Reintentar');
    if (btn !== 'Reintentar') return;
  }
  await ctx.globalState.update(TRIED_KEY, vscode.version);
  await vscode.commands.executeCommand('extension.installCustomCSS');
  if (injected(html)) {
    await askRestart('IntelliJ Toolbar reactivó la barra de título (Custom CSS and JS). Reinicia VS Code para verla. ' +
      'Si aparece "installation appears to be corrupt", elige "Don\'t Show Again".');
  } else {
    vscode.window.showWarningMessage('IntelliJ Toolbar: no se pudo reactivar la barra de título. Activa Visual Studio Code en ' +
      'Ajustes del Sistema → Privacidad y seguridad → Gestión de apps y reinicia VS Code.');
  }
}

function register(ctx) {
  // Un poco después del arranque, para que el loader ya esté activo y no compita con el inicio.
  const t = setTimeout(() => check(ctx).catch(e => console.error('[intellij-toolbar] injection', e)), 3000);
  ctx.subscriptions.push({ dispose: () => clearTimeout(t) });
}

module.exports = { register };
