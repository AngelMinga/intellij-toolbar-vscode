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

  // Ventanas de herramientas de abajo (columna izquierda de IntelliJ): Run, Terminal, Problems, Git.
  // titlebar-inject.js las mueve al pie de la barra de actividad y marca la que está abierta.
  const L = vscode.StatusBarAlignment.Left;
  const tw = (id, name, prio, icon, tooltip, command) => {
    const it = vscode.window.createStatusBarItem(id, L, prio);
    it.name = `IntelliJ Toolbar: ${name}`;
    it.text = icon;
    it.tooltip = tooltip;
    it.command = command;
    ctx.subscriptions.push(it);
    return it;
  };
  const toolWindows = [
    tw('ijt.tw.run', 'Run', 7, '$(play-circle)', 'Run (⌘4)', 'workbench.debug.action.toggleRepl'),
    tw('ijt.tw.terminal', 'Terminal', 6, '$(terminal)', 'Terminal (⌥F12)', 'workbench.action.terminal.toggleTerminal'),
    tw('ijt.tw.output', 'Output', 5, '$(output)', 'Output', 'workbench.action.output.toggleOutput'),
    tw('ijt.tw.problems', 'Problems', 4, '$(warning)', 'Problems (⌘6)', 'workbench.actions.view.toggleProblems')
  ];
  toolWindows.forEach(i => i.show());

  // TODO: la vista de Todo Tree se mueve (una vez) a la pestaña "TODO" del panel que declara esta extensión.
  const todo = tw('ijt.tw.todo', 'TODO', 3, '$(checklist)', 'TODO', 'workbench.view.extension.ijt-todo');
  const TODO_VIEW = 'todo-tree-view';
  if (vscode.extensions.getExtension('Gruntfuggly.todo-tree')) {
    todo.show();
    // VS Code registra el contenedor del package.json ("ijt-todo") con el id "workbench.view.extension.ijt-todo";
    // vscode.moveViews necesita ese id completo. Clave v2: la v1 se marcó sin haber movido nada.
    if (!ctx.globalState.get('ijt.todoMoved.v2')) {
      Promise.resolve(vscode.commands.executeCommand('vscode.moveViews', { viewIds: [TODO_VIEW], destinationId: 'workbench.view.extension.ijt-todo' }))
        .then(() => ctx.globalState.update('ijt.todoMoved.v2', true))
        .catch(e => console.error('[intellij-toolbar] moveViews', e));
    }
  }

  // Git: la pestaña "MultiGit" del panel (contenedor multigit-panel); sin MultiGit, Source Control.
  const git = tw('ijt.tw.git', 'Git', 2, '$(source-control)', 'Git (⌘9)', 'workbench.view.extension.multigit-panel');
  if (!vscode.extensions.getExtension('angelminga.multigit')) {
    git.command = 'workbench.view.scm';
    git.tooltip = 'Source Control (⌘0)';
  }
  git.show();

  // Columna derecha (como IntelliJ): Notifications, Running Devices (PhonePane), Flutter Inspector y AI (Claude Code).
  // titlebar-inject.js las pone en una franja vertical a la derecha de la ventana.
  const has = id => !!vscode.extensions.getExtension(id);
  tw('ijt.rw.notifications', 'Notifications', 14, '$(bell)', 'Notifications', 'notifications.toggleList').show();
  if (has('angelminga.phonepane')) {
    tw('ijt.rw.devices', 'Running Devices', 13, '$(device-mobile)', 'Running Devices (PhonePane)', 'workbench.view.extension.phonePaneRight').show();
  }
  if (has('Dart-Code.dart-code')) {
    tw('ijt.rw.inspector', 'Flutter Inspector', 12, '$(inspect)', 'Flutter Inspector (DevTools)', 'dart.openDevToolsInspector').show();
  }
  if (has('anthropic.claude-code')) {
    tw('ijt.rw.ai', 'AI', 11, '$(sparkle)', 'Claude Code', 'claude-vscode.focus').show();
  }

  // Widget de inspecciones (arriba a la derecha del editor, como IntelliJ): errores y warnings del archivo activo.
  const inspections = tw('ijt.inspections', 'Inspections', 1, '$(check)', 'Problems (⌘6)', 'workbench.actions.view.problems');
  const refreshInspections = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) { inspections.hide(); return; }
    let errors = 0, warnings = 0, infos = 0;
    for (const d of vscode.languages.getDiagnostics(ed.document.uri)) {
      if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
      else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
      else infos++;
    }
    const parts = [];
    if (errors) parts.push(`$(error) ${errors}`);
    if (warnings) parts.push(`$(warning) ${warnings}`);
    if (infos) parts.push(`$(info) ${infos}`);
    inspections.text = parts.length ? parts.join('  ') : '$(check)';
    inspections.tooltip = parts.length
      ? `${errors} errores, ${warnings} warnings, ${infos} sugerencias en este archivo (clic: Problems)`
      : 'Sin problemas en este archivo';
    inspections.show();
  };
  ctx.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(e => {
      const ed = vscode.window.activeTextEditor;
      if (ed && e.uris.some(u => u.toString() === ed.document.uri.toString())) refreshInspections();
    }),
    vscode.window.onDidChangeActiveTextEditor(refreshInspections)
  );
  refreshInspections();

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
