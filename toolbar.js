// Botones extra del lado derecho estilo IntelliJ: Hot Reload, Hot Restart, "más" (⋮), buscar (lupa) y ajustes (⚙).
// Se crean como items de la barra de estado; titlebar-inject.js los mueve a la barra de título.
const vscode = require('vscode');

const R = vscode.StatusBarAlignment.Right;

function item(id, name, priority, text, tooltip, command) {
  const it = vscode.window.createStatusBarItem(id, R, priority);
  it.name = `IntelliJ Toolbar: ${name}`;
  it.text = text;
  it.tooltip = tooltip;
  it.command = command;
  return it;
}

function isDartSession(s) {
  return s && (s.type === 'dart' || s.type === 'flutter');
}

// Device, configuración, Run, Debug y Stop los aporta la extensión "run-configurations"
// (angelminga.run-configurations); aquí solo quedan los extras que esa extensión no tiene.
function register(ctx) {
  const reload = item('ijt.reloadBtn', 'Hot Reload', 10009, '$(zap)', 'Hot Reload', 'ijt.hotReload');
  const restart = item('ijt.restartBtn', 'Hot Restart', 10008, '$(debug-restart)', 'Hot Restart', 'ijt.hotRestart');
  const more = item('ijt.moreBtn', 'Más acciones', 10004, '$(kebab-vertical)', 'Más acciones', 'ijt.more');
  // Lupa estilo IntelliJ: abre el mismo panel que el buscador del centro (Go to File, comandos, texto…).
  const search = item('ijt.searchBtn', 'Buscar', 10003, '$(search)',
    'Buscar: archivos, comandos, texto, símbolos (⌘P)', 'workbench.action.quickOpenWithModes');
  // Engranaje estilo IntelliJ ("IDE and Project Settings").
  const settings = item('ijt.settingsBtn', 'Ajustes', 10002, '$(settings-gear)', 'Ajustes, atajos, extensiones y tema', 'ijt.settings');
  ctx.subscriptions.push(reload, restart, more, search, settings);

  const sessions = new Set();

  const refreshButtons = () => {
    const running = sessions.size > 0;
    const dartRunning = [...sessions].some(isDartSession);
    more.show();
    search.show();
    settings.show();
    dartRunning ? reload.show() : reload.hide();
    running ? restart.show() : restart.hide();
    restart.tooltip = dartRunning ? 'Hot Restart' : 'Restart';
  };

  for (const s of [vscode.debug.activeDebugSession].filter(Boolean)) sessions.add(s);
  ctx.subscriptions.push(
    vscode.debug.onDidStartDebugSession(s => { sessions.add(s); refreshButtons(); }),
    vscode.debug.onDidTerminateDebugSession(s => { sessions.delete(s); refreshButtons(); })
  );

  refreshButtons();
  return { refreshConfig: () => {} };
}

async function exec(cmd, ...args) {
  try { return await vscode.commands.executeCommand(cmd, ...args); }
  catch (e) { vscode.window.showErrorMessage(`No se pudo ejecutar ${cmd}: ${e && e.message ? e.message : e}`); }
}

async function hasCommand(cmd) {
  const cmds = await vscode.commands.getCommands(true);
  return cmds.includes(cmd);
}

async function moreMenu() {
  const flutter = await hasCommand('flutter.selectDevice');
  const S = vscode.QuickPickItemKind.Separator;
  const items = [];
  if (flutter) {
    items.push(
      { label: 'Flutter', kind: S },
      { label: '$(zap) Hot Reload', cmd: 'flutter.hotReload' },
      { label: '$(debug-restart) Hot Restart', cmd: 'flutter.hotRestart' },
      { label: '$(tools) Open DevTools', cmd: 'flutter.openDevTools' },
      { label: '$(device-mobile) Select Device…', cmd: 'flutter.selectDevice' },
      { label: '$(dashboard) Run in Profile Mode', cmd: 'flutter.runProfileMode' },
      { label: '$(plug) Attach to Flutter on Device', cmd: 'flutter.attach' },
      { label: 'Proyecto', kind: S },
      { label: '$(package) Get Packages', cmd: 'flutter.packages.get' },
      { label: '$(arrow-circle-up) Upgrade Packages', cmd: 'flutter.packages.upgrade' },
      { label: '$(trash) Clean Project', cmd: 'flutter.clean' }
    );
  }
  const runConfigs = await hasCommand('runConfigurations.edit');
  items.push(
    { label: 'Run / Debug', kind: S },
    runConfigs
      ? { label: '$(gear) Edit Configurations…', cmd: 'runConfigurations.edit' }
      : { label: '$(gear) Edit Configurations… (launch.json)', cmd: 'workbench.action.debug.configure' },
    { label: '$(debug-console) Debug Console', cmd: 'workbench.debug.action.toggleRepl' },
    { label: '$(debug-breakpoint-unverified) Breakpoints', cmd: 'workbench.debug.action.focusBreakpointsView' }
  );
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Más acciones' });
  if (pick && pick.cmd) await exec(pick.cmd);
}

async function settingsMenu() {
  const S = vscode.QuickPickItemKind.Separator;
  const items = [
    { label: '$(settings-gear) Settings…', description: '⌘,', cmd: 'workbench.action.openSettings' },
    { label: '$(json) Settings (JSON)', cmd: 'workbench.action.openSettingsJson' },
    { label: '$(keyboard) Keymap…', cmd: 'workbench.action.openGlobalKeybindings' },
    { label: '$(json) Keymap (JSON)', cmd: 'workbench.action.openGlobalKeybindingsFile' },
    { label: '$(extensions) Plugins…', description: 'Extensiones', cmd: 'workbench.view.extensions' },
    { label: 'Apariencia', kind: S },
    { label: '$(symbol-color) Theme…', cmd: 'workbench.action.selectTheme' },
    { label: '$(file-media) File Icon Theme…', cmd: 'workbench.action.selectIconTheme' },
    { label: '$(zoom-in) Zoom In', cmd: 'workbench.action.zoomIn' },
    { label: '$(zoom-out) Zoom Out', cmd: 'workbench.action.zoomOut' },
    { label: 'IntelliJ Toolbar', kind: S },
    { label: '$(refresh) Reload Custom CSS and JS', description: 'tras editar titlebar-inject.js', cmd: 'extension.updateCustomCSS' },
    { label: '$(account) Profiles…', cmd: 'workbench.profiles.actions.manageProfiles' },
    { label: '$(cloud-download) Check for Updates…', cmd: 'update.checkForUpdate' }
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Ajustes' });
  if (pick && pick.cmd) await exec(pick.cmd);
}

module.exports = { register, moreMenu, settingsMenu, exec };
