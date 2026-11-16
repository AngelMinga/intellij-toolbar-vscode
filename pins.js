// ⋮ "More Tool Windows" (como IntelliJ): menú con las ventanas que no están en la columna izquierda.
// Al elegir una se abre y queda fijada en la columna; se quita con clic derecho → "Remove from Sidebar"
// (titlebar-inject.js → bridge.js → unpin) o con el botón ✕ del propio menú.
//
// Dos tipos de fijadas:
// - `native`: íconos de VS Code que titlebar-inject.js oculta (Search, Extensions, Run and Debug); al fijarlos
//   se vuelven a mostrar. El valor es el aria-label con el que el inject los reconoce.
// - el resto: un item de la barra de estado "ijt.pin.<key>" que el inject coloca bajo los íconos de arriba.
// El inject se entera de cuáles hay por el aria-label del ⋮:
// "More Tool Windows [ijt-pins:<key>=<aria-label nativo>|…;<key>|…]".
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const STATE_KEY = 'ijt.pinnedToolWindows.v1';
const MORE_LABEL = 'More Tool Windows';

let ctx = null;
let moreItem = null;
const pinItems = new Map(); // key → StatusBarItem

// Ventanas conocidas. `fixed`: ya están siempre en la columna (arriba o abajo), no se fijan.
const CATALOG = [
  { group: 'Ocultas en la barra', key: 'search', label: 'Search', icon: 'search', description: '⇧⌘F', cmd: 'workbench.view.search', native: 'Search' },
  { group: 'Ocultas en la barra', key: 'extensions', label: 'Extensions', icon: 'extensions', description: '⇧⌘X', cmd: 'workbench.view.extensions', native: 'Extensions' },
  { group: 'Ocultas en la barra', key: 'debug', label: 'Run and Debug', icon: 'debug-alt', description: '⇧⌘D', cmd: 'workbench.view.debug', native: 'Run and Debug' },
  { group: 'Ventanas', key: 'timeline', label: 'Timeline', icon: 'history', cmd: 'timeline.focus' },
  { group: 'Ventanas', key: 'ports', label: 'Ports', icon: 'plug', cmd: '~remote.forwardedPorts.focus' },
  { group: 'En la columna', key: 'explorer', label: 'Project', icon: 'files', description: '⇧⌘E', cmd: 'workbench.view.explorer', fixed: true },
  { group: 'En la columna', key: 'scm', label: 'Source Control', icon: 'source-control', description: '⌃⇧G', cmd: 'workbench.view.scm', fixed: true },
  { group: 'En la columna', key: 'structure', label: 'Structure', icon: 'list-tree', cmd: 'outline.focus', fixed: true },
  { group: 'En la columna', key: 'terminal', label: 'Terminal', icon: 'terminal', description: '⌃`', cmd: 'workbench.action.terminal.toggleTerminal', fixed: true },
  { group: 'En la columna', key: 'repl', label: 'Debug Console', icon: 'debug-console', description: '⇧⌘Y', cmd: 'workbench.debug.action.toggleRepl', fixed: true },
  { group: 'En la columna', key: 'output', label: 'Output', icon: 'output', description: '⇧⌘U', cmd: 'workbench.action.output.toggleOutput', fixed: true },
  { group: 'En la columna', key: 'problems', label: 'Problems', icon: 'warning', description: '⇧⌘M', cmd: 'workbench.actions.view.problems', fixed: true }
];

// Título traducible ("%views.title%"): se busca en el package.nls.json de la extensión. Sin él, se descarta.
function nlsTitle(ext, title) {
  const m = /^%(.+)%$/.exec(title);
  if (!m) return title;
  try {
    const nls = JSON.parse(fs.readFileSync(path.join(ext.extensionPath, 'package.nls.json'), 'utf8'));
    const v = nls[m[1]];
    return typeof v === 'string' ? v : (v && typeof v.message === 'string' ? v.message : '');
  } catch { return ''; }
}

// Contenedores que aportan las extensiones (contributes.viewsContainers), menos los de esta extensión.
// Se abren con "workbench.view.extension.<id>". Se calcula una vez y se rehace si cambian las extensiones.
let extCache = null;
function extensionEntries() {
  if (extCache) return extCache;
  const out = [];
  for (const ext of vscode.extensions.all) {
    if (ext.id.toLowerCase() === 'angelminga.intellij-toolbar') continue;
    const vc = ext.packageJSON && ext.packageJSON.contributes && ext.packageJSON.contributes.viewsContainers;
    if (!vc) continue;
    for (const where of ['activitybar', 'panel']) {
      for (const c of vc[where] || []) {
        const label = c && c.id && c.title ? nlsTitle(ext, c.title) : '';
        if (!label) continue;
        out.push({
          group: where === 'panel' ? 'Extensiones (panel)' : 'Extensiones (barra lateral)',
          key: 'ext.' + c.id.replace(/[^\w.-]/g, '_'),
          label,
          icon: where === 'panel' ? 'layout-panel' : 'extensions',
          description: ext.packageJSON.displayName || ext.id,
          cmd: `workbench.view.extension.${c.id}`
        });
      }
    }
  }
  extCache = out.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  return extCache;
}

const getPins = () => ctx.globalState.get(STATE_KEY, []);

async function setPins(pins) {
  await ctx.globalState.update(STATE_KEY, pins);
  render();
}

// Las fijadas se guardan completas (no solo la clave) para no depender de que la extensión siga instalada.
async function pin(entry) {
  if (entry.fixed || getPins().some(p => p.key === entry.key)) return;
  const { key, label, icon, cmd, native } = entry;
  await setPins([...getPins(), { key, label, icon, cmd, native }]);
}

async function unpin(key) {
  await setPins(getPins().filter(p => p.key !== key));
}

// Fijadas que se pueden mostrar: las de una extensión desinstalada o deshabilitada se guardan, pero no se
// muestran (su comando fallaría); vuelven solas si la extensión vuelve.
function visiblePins() {
  const ext = new Set(extensionEntries().map(e => e.key));
  return getPins().filter(p => !p.key.startsWith('ext.') || ext.has(p.key));
}

function render() {
  const pins = visiblePins();
  const keep = new Set(pins.filter(p => !p.native).map(p => p.key));
  for (const [key, it] of pinItems) {
    if (!keep.has(key)) { it.dispose(); pinItems.delete(key); }
  }
  pins.forEach((p, i) => {
    if (p.native || pinItems.has(p.key)) return;
    const it = vscode.window.createStatusBarItem(`ijt.pin.${p.key}`, vscode.StatusBarAlignment.Left, 9 - i / 100);
    it.name = `IntelliJ Toolbar: ${p.label}`;
    it.text = `$(${p.icon || 'window'})`;
    it.tooltip = p.label;
    it.command = p.cmd;
    it.accessibilityInformation = { label: p.label, role: 'button' };
    it.show();
    pinItems.set(p.key, it);
  });
  const natives = pins.filter(p => p.native).map(p => `${p.key}=${p.native}`).join('|');
  const items = pins.filter(p => !p.native).map(p => p.key).join('|');
  moreItem.accessibilityInformation = { label: `${MORE_LABEL} [ijt-pins:${natives};${items}]`, role: 'button' };
}

async function run(cmd) {
  try { await vscode.commands.executeCommand(cmd); }
  catch (e) { vscode.window.showErrorMessage(`No se pudo abrir: ${e && e.message ? e.message : e}`); }
}

// Menú del ⋮. Elegir una ventana la abre y la fija; el botón de cada fila la fija o la quita sin abrirla.
function menu() {
  const S = vscode.QuickPickItemKind.Separator;
  const PIN = { iconPath: new vscode.ThemeIcon('pin'), tooltip: 'Fijar en la columna' };
  const UNPIN = { iconPath: new vscode.ThemeIcon('close'), tooltip: 'Quitar de la columna (Remove from Sidebar)' };
  const entries = [...CATALOG, ...extensionEntries()];
  const extra = [
    { group: 'Más', label: 'Open View…', icon: 'eye', description: 'todas las vistas', cmd: 'workbench.action.openView', fixed: true },
    { group: 'Más', label: 'Toggle Primary Side Bar', icon: 'layout-sidebar-left', description: '⌘B', cmd: 'workbench.action.toggleSidebarVisibility', fixed: true },
    { group: 'Más', label: 'Toggle Secondary Side Bar', icon: 'layout-sidebar-right', description: '⌥⌘B', cmd: 'workbench.action.toggleAuxiliaryBar', fixed: true },
    { group: 'Más', label: 'Toggle Panel', icon: 'layout-panel', description: '⌘J', cmd: 'workbench.action.togglePanel', fixed: true }
  ];

  const qp = vscode.window.createQuickPick();
  qp.placeholder = 'More Tool Windows — elige una para abrirla y fijarla en la columna';
  qp.matchOnDescription = true;
  const build = () => {
    const pinned = new Set(getPins().map(p => p.key));
    const items = [];
    let group = null;
    for (const e of [...entries, ...extra]) {
      if (e.group !== group) { group = e.group; items.push({ label: group, kind: S }); }
      const isPinned = pinned.has(e.key);
      items.push({
        label: `$(${e.icon}) ${e.label}`,
        description: [isPinned ? '$(pinned) fijada' : '', e.description || ''].filter(Boolean).join('  '),
        buttons: e.fixed ? [] : [isPinned ? UNPIN : PIN],
        entry: e
      });
    }
    const active = qp.activeItems[0] && qp.activeItems[0].entry;
    qp.items = items;
    if (active) {
      const again = items.find(i => i.entry === active);
      if (again) qp.activeItems = [again];
    }
  };
  build();
  qp.onDidTriggerItemButton(async ({ item, button }) => {
    if (button === UNPIN) await unpin(item.entry.key); else await pin(item.entry);
    build();
  });
  qp.onDidAccept(async () => {
    const sel = qp.selectedItems[0];
    qp.hide();
    if (!sel || !sel.entry) return;
    await pin(sel.entry);
    await run(sel.entry.cmd);
  });
  qp.onDidHide(() => qp.dispose());
  qp.show();
}

function register(context) {
  ctx = context;
  moreItem = vscode.window.createStatusBarItem('ijt.tw.more', vscode.StatusBarAlignment.Left, 8);
  moreItem.name = `IntelliJ Toolbar: ${MORE_LABEL}`;
  moreItem.text = '$(ellipsis)';
  moreItem.tooltip = MORE_LABEL;
  moreItem.command = 'ijt.moreToolWindows';
  moreItem.show();
  ctx.subscriptions.push(moreItem, vscode.commands.registerCommand('ijt.moreToolWindows', menu),
    vscode.extensions.onDidChange(() => { extCache = null; render(); }), {
    dispose: () => { pinItems.forEach(it => it.dispose()); pinItems.clear(); }
  });
  render();
}

module.exports = { register, unpin };
