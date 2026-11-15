// Menús estilo IntelliJ: proyectos recientes y ramas Git.
const vscode = require('vscode');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const SEP = vscode.QuickPickItemKind.Separator;
const HOME = os.homedir();

function tilde(p) {
  return p && p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
}

function toUri(u) {
  if (!u) return undefined;
  if (u instanceof vscode.Uri) return u;
  try {
    return vscode.Uri.from({ scheme: u.scheme || 'file', authority: u.authority || '', path: u.path || '', query: u.query || '', fragment: u.fragment || '' });
  } catch { return undefined; }
}

function initials(name) {
  const parts = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const camel = name.match(/[A-Z]/g);
  if (camel && camel.length >= 2) return (camel[0] + camel[1]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}

function runCmd(cmd, ...args) {
  return Promise.resolve(vscode.commands.executeCommand(cmd, ...args)).catch(err =>
    vscode.window.showErrorMessage(`No se pudo ejecutar ${cmd}: ${err && err.message ? err.message : err}`));
}

// ---------------------------------------------------------------- Proyectos

async function pickProject() {
  let recent = { workspaces: [] };
  try { recent = await vscode.commands.executeCommand('_workbench.getRecentlyOpened') || recent; } catch { /* API interna no disponible */ }

  const openPaths = new Set((vscode.workspace.workspaceFolders || []).map(f => f.uri.toString()));
  const items = [
    { label: '$(add) New Window', action: () => runCmd('workbench.action.newWindow') },
    { label: '$(folder-opened) Open…', action: () => runCmd('workbench.action.files.openFolder') },
    { label: '$(repo-clone) Clone Repository…', action: () => runCmd('git.clone') },
    { label: 'Open Projects', kind: SEP }
  ];
  for (const f of vscode.workspace.workspaceFolders || []) {
    items.push({ label: `$(root-folder) ${f.name}`, description: tilde(f.uri.fsPath), detail: undefined, current: true });
  }
  items.push({ label: 'Recent Projects', kind: SEP });
  for (const w of recent.workspaces || []) {
    const uri = toUri(w.folderUri || (w.workspace && w.workspace.configPath));
    if (!uri || openPaths.has(uri.toString())) continue;
    const name = w.label || path.basename(uri.path).replace(/\.code-workspace$/, '');
    items.push({
      label: `$(folder) ${initials(name)}  ${name}`,
      description: uri.scheme === 'file' ? tilde(uri.fsPath) : uri.toString(),
      uri,
      isWorkspace: !w.folderUri,
      buttons: [{ iconPath: new vscode.ThemeIcon('window'), tooltip: 'Abrir en esta ventana' }]
    });
  }

  const qp = vscode.window.createQuickPick();
  qp.items = items;
  qp.placeholder = 'Proyectos (Enter: nueva ventana · botón ▢: esta ventana)';
  qp.matchOnDescription = true;
  const open = (item, sameWindow) => {
    qp.hide();
    if (item.action) return item.action();
    if (item.uri) return runCmd('vscode.openFolder', item.uri, { forceNewWindow: !sameWindow });
  };
  qp.onDidAccept(() => { const it = qp.selectedItems[0]; if (it && !it.current) open(it, false); else qp.hide(); });
  qp.onDidTriggerItemButton(e => open(e.item, true));
  qp.onDidHide(() => qp.dispose());
  qp.show();
}

// ---------------------------------------------------------------- Git

const apiOf = exp => (exp && exp.enabled ? exp.getAPI(1) : undefined);

/** API de la extensión Git si ya está activa (síncrono, para refrescos de la barra). */
function gitApi() {
  const ext = vscode.extensions.getExtension('vscode.git');
  return ext && ext.isActive ? apiOf(ext.exports) : undefined;
}

/** API de la extensión Git, activándola si hace falta. */
async function gitApiAsync() {
  const ext = vscode.extensions.getExtension('vscode.git');
  if (!ext) return undefined;
  return apiOf(ext.isActive ? ext.exports : await ext.activate());
}

function currentRepo(api) {
  if (!api || !api.repositories.length) return undefined;
  const ed = vscode.window.activeTextEditor;
  if (ed) {
    const r = api.getRepository(ed.document.uri);
    if (r) return r;
  }
  return api.repositories[0];
}

/** Ejecuta git y devuelve stdout; rechaza con el stderr de git como mensaje. */
function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim()));
      else resolve(stdout);
    });
  });
}

/** Como runGit, pero ante un error devuelve '' (para datos opcionales como el reflog). */
function git(cwd, args) {
  return runGit(cwd, args).catch(() => '');
}

// Ramas visitadas recientemente según el reflog (como "Recent" de IntelliJ).
async function recentBranches(root, localNames, limit = 5) {
  const out = await git(root, ['reflog', 'show', '--format=%gs', '-n', '500']);
  const seen = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^checkout: moving from .+ to (.+)$/);
    if (!m) continue;
    const b = m[1].trim();
    if (localNames.has(b) && !seen.includes(b)) seen.push(b);
    if (seen.length >= limit) break;
  }
  return seen;
}

const MAIN_NAMES = new Set(['main', 'master']);

function branchIcon(name, isCurrent) {
  if (isCurrent) return '$(tag)';
  if (MAIN_NAMES.has(name.replace(/^[^/]+\//, ''))) return '$(star-full)';
  return '$(git-branch)';
}

async function pickBranch() {
  const api = await gitApiAsync();
  const repo = currentRepo(api);
  if (!repo) return vscode.window.showWarningMessage('No hay un repositorio Git abierto.');
  const root = repo.rootUri.fsPath;
  const head = repo.state.HEAD && repo.state.HEAD.name;

  const refs = await repo.getRefs({ sort: 'committerdate' });
  const locals = refs.filter(r => r.type === 0 && r.name);
  const remotes = refs.filter(r => r.type === 1 && r.name && !r.name.endsWith('/HEAD'));
  const localNames = new Set(locals.map(r => r.name));

  const details = new Map();
  await Promise.all(locals.map(async r => {
    try { details.set(r.name, await repo.getBranch(r.name)); } catch { /* ignore */ }
  }));

  const localItem = (name) => {
    const d = details.get(name) || {};
    const up = d.upstream ? `${d.upstream.remote}/${d.upstream.name}` : '';
    const sync = [d.behind ? `↓${d.behind}` : '', d.ahead ? `↑${d.ahead}` : ''].filter(Boolean).join(' ');
    return {
      label: `${branchIcon(name, name === head)} ${name}`,
      description: [sync, up].filter(Boolean).join('   '),
      ref: name, remote: false
    };
  };

  const recent = await recentBranches(root, localNames);
  if (head && localNames.has(head) && !recent.includes(head)) recent.unshift(head);

  const sortLocals = (a, b) => (MAIN_NAMES.has(b.name) - MAIN_NAMES.has(a.name)) || a.name.localeCompare(b.name);

  const items = [
    { label: '$(arrow-down) Update Project…', description: '⌘T', action: () => runCmd('git.pull') },
    { label: '$(check) Commit…', description: '⌘K', action: () => runCmd('workbench.view.scm') },
    { label: '$(arrow-up) Push…', description: '⇧⌘K', action: () => runCmd('git.push') },
    { label: '', kind: SEP },
    { label: '$(add) New Branch…', action: () => newBranch(repo, undefined) },
    { label: '$(list-tree) New Worktree…', action: () => runCmd('git.createWorktree') },
    { label: '$(tag) Checkout Tag or Revision…', action: () => runCmd('git.checkoutDetached') },
    { label: 'Recent', kind: SEP },
    ...recent.map(localItem),
    { label: 'Local', kind: SEP },
    ...locals.slice().sort(sortLocals).map(r => localItem(r.name)),
    { label: 'Remote', kind: SEP },
    ...remotes.slice().sort((a, b) => (MAIN_NAMES.has(b.name.split('/').slice(1).join('/')) - MAIN_NAMES.has(a.name.split('/').slice(1).join('/'))) || a.name.localeCompare(b.name))
      .map(r => ({ label: `${branchIcon(r.name, false)} ${r.name}`, ref: r.name, remote: true }))
  ];

  const qp = vscode.window.createQuickPick();
  qp.items = items;
  qp.placeholder = 'Search for branches and actions';
  qp.matchOnDescription = true;
  qp.buttons = [{ iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Fetch' }];
  qp.onDidTriggerButton(async () => { qp.busy = true; await runCmd('git.fetch'); qp.hide(); pickBranch(); });
  qp.onDidAccept(() => {
    const it = qp.selectedItems[0];
    qp.hide();
    if (!it) return;
    if (it.action) return it.action();
    if (it.ref) return branchActions(repo, it.ref, it.remote, head, localNames);
  });
  qp.onDidHide(() => qp.dispose());
  qp.show();
}

async function newBranch(repo, from) {
  const name = await vscode.window.showInputBox({
    prompt: from ? `Nueva rama desde '${from}'` : 'Nueva rama desde la actual',
    placeHolder: 'feature/mi-rama',
    validateInput: v => /^[^\s~^:?*[\\]+$/.test(v || '') ? undefined : 'Nombre de rama inválido'
  });
  if (!name) return;
  try { await repo.createBranch(name, true, from); }
  catch (e) { vscode.window.showErrorMessage(e.message || String(e)); }
}

async function branchActions(repo, ref, isRemote, head, localNames) {
  const localName = isRemote ? ref.split('/').slice(1).join('/') : ref;
  const isCurrent = !isRemote && ref === head;
  const actions = [];
  if (!isCurrent) actions.push({ label: '$(check) Checkout', run: () => checkout(repo, ref, isRemote, localName, localNames) });
  actions.push({ label: `$(add) New Branch from '${ref}'…`, run: () => newBranch(repo, ref) });
  if (!isCurrent && head) {
    actions.push({ label: `$(git-merge) Merge '${ref}' into '${head}'`, run: () => repo.merge(ref) });
    actions.push({ label: `$(git-compare) Compare with '${head}'`, run: () => runCmd('git.viewChanges') });
  }
  if (isCurrent) {
    actions.push({ label: '$(arrow-down) Update', run: () => repo.pull() });
    actions.push({ label: '$(arrow-up) Push…', run: () => repo.push() });
    actions.push({ label: '$(edit) Rename…', run: () => runCmd('git.renameBranch') });
  }
  if (!isRemote && !isCurrent) {
    actions.push({ label: '', kind: SEP });
    actions.push({
      label: '$(trash) Delete', run: async () => {
        const ok = await vscode.window.showWarningMessage(`¿Eliminar la rama local '${ref}'?`, { modal: true }, 'Eliminar');
        if (ok) await repo.deleteBranch(ref, false);
      }
    });
  }
  const pick = await vscode.window.showQuickPick(actions, { placeHolder: ref });
  if (!pick || !pick.run) return;
  try { await pick.run(); }
  catch (e) { vscode.window.showErrorMessage(e.message || String(e)); }
}

async function checkout(repo, ref, isRemote, localName, localNames) {
  if (!isRemote) return repo.checkout(ref);
  if (localNames.has(localName)) return repo.checkout(localName);
  await repo.createBranch(localName, true, ref);
  try { await repo.setBranchUpstream(localName, ref); } catch { /* opcional */ }
}

// ---------------------------------------------------------------- Barra de estado

function registerStatus(ctx) {
  const project = vscode.window.createStatusBarItem('ijt.project', vscode.StatusBarAlignment.Left, 10002);
  project.name = 'IntelliJ Toolbar: Proyecto';
  project.command = 'ijt.projects';
  project.tooltip = 'Proyectos recientes';

  const branch = vscode.window.createStatusBarItem('ijt.branchMenu', vscode.StatusBarAlignment.Left, 10001);
  branch.name = 'IntelliJ Toolbar: Rama';
  branch.command = 'ijt.branch';
  branch.tooltip = 'Ramas y acciones Git';

  const refreshProject = () => {
    const name = vscode.workspace.name || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].name);
    if (!name) { project.hide(); return; }
    project.text = `$(folder) ${name.replace(/ \(Workspace\)$/, '')} $(chevron-down)`;
    project.show();
  };

  const watched = new Set();
  const refreshBranch = () => {
    const repo = currentRepo(gitApi());
    if (!repo) { branch.hide(); return; }
    if (!watched.has(repo)) {
      watched.add(repo);
      ctx.subscriptions.push(repo.state.onDidChange(refreshBranch));
    }
    const h = repo.state.HEAD;
    const name = h ? (h.name || (h.commit ? h.commit.slice(0, 8) : '…')) : '…';
    branch.text = `$(git-branch) ${name} $(chevron-down)`;
    branch.show();
  };

  refreshProject();
  ctx.subscriptions.push(project, branch,
    vscode.workspace.onDidChangeWorkspaceFolders(refreshProject),
    vscode.window.onDidChangeActiveTextEditor(refreshBranch));

  gitApiAsync().then(api => {
    if (!api) return;
    ctx.subscriptions.push(api.onDidOpenRepository(refreshBranch), api.onDidCloseRepository(refreshBranch));
    refreshBranch();
  }).catch(() => {});
  return { project, branch };
}

module.exports = { pickProject, pickBranch, registerStatus, gitApiAsync, currentRepo, recentBranches, git, runGit, newBranch, MAIN_NAMES };
