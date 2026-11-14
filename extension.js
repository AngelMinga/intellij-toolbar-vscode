const vscode = require('vscode');
const menus = require('./menus');

const KEY = 'ijt.selectedConfig';

function getFolder() {
  const ed = vscode.window.activeTextEditor;
  if (ed) {
    const f = vscode.workspace.getWorkspaceFolder(ed.document.uri);
    if (f) return f;
  }
  return vscode.workspace.workspaceFolders?.[0];
}

function getConfigs(folder) {
  const launch = vscode.workspace.getConfiguration('launch', folder?.uri);
  const configs = launch.get('configurations') || [];
  const compounds = launch.get('compounds') || [];
  return [...configs.map(c => c.name), ...compounds.map(c => c.name)].filter(Boolean);
}

async function pickConfig(ctx) {
  const folder = getFolder();
  const names = getConfigs(folder);
  const current = ctx.workspaceState.get(KEY);
  const items = [
    { label: '$(file-code) Archivo actual (sin launch.json)', value: '' },
    ...names.map(n => ({ label: (n === current ? '$(check) ' : '$(circle-large-outline) ') + n, value: n })),
    { label: '$(add) Editar launch.json…', value: '__edit__' }
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: current ? `Configuración actual: ${current}` : 'Selecciona la configuración de Run/Debug'
  });
  if (!pick) return undefined;
  if (pick.value === '__edit__') {
    await vscode.commands.executeCommand('workbench.action.debug.configure');
    return undefined;
  }
  await ctx.workspaceState.update(KEY, pick.value);
  updateStatus();
  return pick.value;
}

async function launch(ctx, noDebug) {
  const folder = getFolder();
  let name = ctx.workspaceState.get(KEY);
  const names = getConfigs(folder);
  if (name && !names.includes(name)) name = undefined;
  if (name === undefined && names.length > 1) {
    name = await pickConfig(ctx);
    if (name === undefined) return;
  } else if (name === undefined && names.length === 1) {
    name = names[0];
  }
  if (name) {
    await vscode.debug.startDebugging(folder, name, { noDebug });
  } else {
    // Sin configuración: usa el debugger por defecto del archivo actual (Dart/Flutter, Node, etc.)
    await vscode.commands.executeCommand(noDebug ? 'workbench.action.debug.run' : 'workbench.action.debug.start');
  }
}

let toolbarApi;
function updateStatus() {
  if (toolbarApi) toolbarApi.refreshConfig();
}

function activate(ctx) {
  const toolbar = require('./toolbar');
  toolbarApi = toolbar.register(ctx);

  const reg = (id, fn) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('ijt.more', () => toolbar.moreMenu());
  reg('ijt.hotReload', async () => {
    const s = vscode.debug.activeDebugSession;
    if (s && (s.type === 'dart' || s.type === 'flutter')) return toolbar.exec('flutter.hotReload');
    return toolbar.exec('workbench.action.debug.restart');
  });
  reg('ijt.branch', () => menus.pickBranch());
  reg('ijt.projects', () => menus.pickProject());
  const items = menus.registerStatus(ctx);
  require('./bridge').start(ctx, items.branch);
  reg('ijt.device', async () => {
    try { await vscode.commands.executeCommand('flutter.selectDevice'); }
    catch { vscode.window.showWarningMessage('Necesitas la extensión Flutter/Dart para seleccionar device.'); }
  });
  reg('ijt.config', () => pickConfig(ctx));
  reg('ijt.run', () => launch(ctx, true));
  reg('ijt.debug', () => launch(ctx, false));
  reg('ijt.stop', () => vscode.commands.executeCommand('workbench.action.debug.stop'));
  reg('ijt.hotRestart', async () => {
    const s = vscode.debug.activeDebugSession;
    if (s && (s.type === 'dart' || s.type === 'flutter')) return toolbar.exec('flutter.hotRestart');
    return toolbar.exec('workbench.action.debug.restart');
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
