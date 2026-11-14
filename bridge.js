// Puente local entre la extensión y titlebar-inject.js (menú de ramas estilo IntelliJ).
// Servidor HTTP solo en 127.0.0.1, puerto aleatorio y token secreto. El puerto y el token
// se pasan al script inyectado en el aria-label del botón de rama.
const vscode = require('vscode');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Trazas de diagnóstico de titlebar-inject.js (se recorta al pasar de 256 KB).
const LOG_FILE = path.join(os.tmpdir(), 'intellij-toolbar-debug.log');
function appendLog(entry) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 256 * 1024) fs.writeFileSync(LOG_FILE, '');
    fs.appendFileSync(LOG_FILE, JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + '\n');
  } catch { /* ignore */ }
}
const { execFile } = require('child_process');
const menus = require('./menus');

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim()));
      else resolve(stdout);
    });
  });
}

async function repoOrThrow() {
  const repo = menus.currentRepo(await menus.gitApiAsync());
  if (!repo) throw new Error('No hay un repositorio Git abierto.');
  return repo;
}

function splitRemote(ref) {
  const i = ref.indexOf('/');
  return { remote: ref.slice(0, i), branch: ref.slice(i + 1) };
}

function withProgress(title, fn) {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, fn);
}

async function showText(content, language) {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function refresh(repo) {
  try { await repo.status(); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ datos

async function getBranches() {
  const repo = await repoOrThrow();
  const root = repo.rootUri.fsPath;
  const head = repo.state.HEAD ? (repo.state.HEAD.name || null) : null;
  const refs = await repo.getRefs({ sort: 'committerdate' });
  const locals = refs.filter(r => r.type === 0 && r.name);
  const remotes = refs.filter(r => r.type === 1 && r.name && !r.name.endsWith('/HEAD')).map(r => r.name);
  const localNames = new Set(locals.map(r => r.name));

  const local = await Promise.all(locals.map(async r => {
    let d = {};
    try { d = await repo.getBranch(r.name); } catch { /* ignore */ }
    return {
      name: r.name,
      upstream: d.upstream ? `${d.upstream.remote}/${d.upstream.name}` : null,
      ahead: d.ahead || 0,
      behind: d.behind || 0
    };
  }));

  const recent = await menus.recentBranches(root, localNames, 5);
  if (head && localNames.has(head) && !recent.includes(head)) recent.unshift(head);

  return { head, root: path.basename(root), recent, local, remote: remotes };
}

// ------------------------------------------------------------------ acciones

async function checkoutRef(repo, ref, remote) {
  if (!remote) return repo.checkout(ref);
  const { branch } = splitRemote(ref);
  const refs = await repo.getRefs({ pattern: `refs/heads/${branch}` });
  if (refs.some(r => r.name === branch)) return repo.checkout(branch);
  await repo.createBranch(branch, true, ref);
  try { await repo.setBranchUpstream(branch, ref); } catch { /* opcional */ }
}

const OPS = {
  update: () => vscode.commands.executeCommand('git.pull'),
  commit: () => vscode.commands.executeCommand('workbench.view.scm'),
  push: () => vscode.commands.executeCommand('git.push'),
  fetch: async () => { const repo = await repoOrThrow(); await withProgress('git fetch…', () => repo.fetch()); },
  newWorktree: () => vscode.commands.executeCommand('git.createWorktree'),
  checkoutTag: () => vscode.commands.executeCommand('git.checkoutDetached'),
  rename: () => vscode.commands.executeCommand('git.renameBranch'),
  // Columna de ventanas de herramientas: click sobre la ventana ya abierta la cierra (como IntelliJ).
  closePanel: () => vscode.commands.executeCommand('workbench.action.closePanel'),

  newBranch: async ({ ref }) => menus.newBranch(await repoOrThrow(), ref || undefined),

  checkout: async ({ ref, remote }) => {
    const repo = await repoOrThrow();
    await withProgress(`Checkout ${ref}…`, () => checkoutRef(repo, ref, remote));
  },

  checkoutRebase: async ({ ref, remote }) => {
    const repo = await repoOrThrow();
    const head = repo.state.HEAD && repo.state.HEAD.name;
    if (!head) throw new Error('No hay una rama actual.');
    await withProgress(`Checkout ${ref} y rebase sobre ${head}…`, async () => {
      await checkoutRef(repo, ref, remote);
      await runGit(repo.rootUri.fsPath, ['rebase', head]);
    });
    await refresh(repo);
  },

  compare: async ({ ref }) => {
    const repo = await repoOrThrow();
    const root = repo.rootUri.fsPath;
    const head = repo.state.HEAD && repo.state.HEAD.name || 'HEAD';
    const [inRef, inHead] = await Promise.all([
      runGit(root, ['log', '--oneline', '--decorate', `${head}..${ref}`]),
      runGit(root, ['log', '--oneline', '--decorate', `${ref}..${head}`])
    ]);
    await showText(
      `# Commits en '${ref}' que no están en '${head}'\n\n${inRef || '(ninguno)\n'}\n` +
      `# Commits en '${head}' que no están en '${ref}'\n\n${inHead || '(ninguno)\n'}`, 'git-rebase');
  },

  diffWorking: async ({ ref }) => {
    const repo = await repoOrThrow();
    const out = await runGit(repo.rootUri.fsPath, ['diff', ref]);
    await showText(out || `Sin diferencias entre '${ref}' y el working tree.\n`, 'diff');
  },

  rebaseOnto: async ({ ref }) => {
    const repo = await repoOrThrow();
    await withProgress(`Rebase sobre ${ref}…`, () => runGit(repo.rootUri.fsPath, ['rebase', ref]));
    await refresh(repo);
  },

  merge: async ({ ref }) => {
    const repo = await repoOrThrow();
    await withProgress(`Merge ${ref}…`, () => repo.merge(ref));
  },

  worktreeFrom: async ({ ref, remote }) => {
    const repo = await repoOrThrow();
    const root = repo.rootUri.fsPath;
    const local = remote ? splitRemote(ref).branch : ref;
    const def = path.join(path.dirname(root), `${path.basename(root)}-${local.replace(/[\\/]/g, '-')}`);
    const dir = await vscode.window.showInputBox({ prompt: `Carpeta del nuevo worktree desde '${ref}'`, value: def });
    if (!dir) return;
    const args = remote ? ['worktree', 'add', '--track', '-b', local, dir, ref] : ['worktree', 'add', dir, ref];
    await withProgress('Creando worktree…', () => runGit(root, args));
    const open = await vscode.window.showInformationMessage(`Worktree creado en ${dir}`, 'Abrir en nueva ventana');
    if (open) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir), { forceNewWindow: true });
  },

  pullRebase: async ({ ref }) => {
    const repo = await repoOrThrow();
    const { remote, branch } = splitRemote(ref);
    await withProgress(`Pull ${ref} (rebase)…`, () => runGit(repo.rootUri.fsPath, ['pull', '--rebase', remote, branch]));
    await refresh(repo);
  },

  pullMerge: async ({ ref }) => {
    const repo = await repoOrThrow();
    const { remote, branch } = splitRemote(ref);
    await withProgress(`Pull ${ref} (merge)…`, () => runGit(repo.rootUri.fsPath, ['pull', '--no-rebase', remote, branch]));
    await refresh(repo);
  },

  delete: async ({ ref, remote }) => {
    const repo = await repoOrThrow();
    if (remote) {
      const ok = await vscode.window.showWarningMessage(
        `¿Eliminar la rama REMOTA '${ref}'? Afecta a todo el equipo.`, { modal: true }, 'Eliminar en el remoto');
      if (!ok) return;
      const { remote: r, branch } = splitRemote(ref);
      await withProgress(`Eliminando ${ref}…`, () => runGit(repo.rootUri.fsPath, ['push', r, '--delete', branch]));
      await refresh(repo);
      return;
    }
    const ok = await vscode.window.showWarningMessage(`¿Eliminar la rama local '${ref}'?`, { modal: true }, 'Eliminar');
    if (!ok) return;
    try {
      await repo.deleteBranch(ref, false);
    } catch (e) {
      const force = await vscode.window.showWarningMessage(
        `'${ref}' no está fusionada. ¿Eliminarla de todas formas? Se perderán sus commits no fusionados.`,
        { modal: true }, 'Forzar eliminación');
      if (force) await repo.deleteBranch(ref, true);
    }
  }
};

// ------------------------------------------------------------------ servidor

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 65536) { reject(new Error('body demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function start(ctx, branchItem) {
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-ijt-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.headers['x-ijt-token'] !== token) { res.writeHead(403); return res.end(); }

    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      if (req.method === 'GET' && req.url === '/branches') return send(200, await getBranches());
      if (req.method === 'POST' && req.url === '/log') {
        appendLog(await readBody(req));
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && req.url === '/action') {
        const body = await readBody(req);
        const op = OPS[body.op];
        if (!op) return send(400, { error: `Acción desconocida: ${body.op}` });
        if (body.wait) {
          try { await op(body); return send(200, { ok: true }); }
          catch (e) { return send(500, { error: e && e.message ? e.message : String(e) }); }
        }
        send(202, { ok: true }); // responder ya: la acción puede abrir diálogos
        try { await op(body); }
        catch (e) { vscode.window.showErrorMessage(e && e.message ? e.message : String(e)); }
        return;
      }
      send(404, { error: 'not found' });
    } catch (e) {
      send(500, { error: e && e.message ? e.message : String(e) });
    }
  });

  server.on('error', e => console.error('[intellij-toolbar] bridge', e));
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    branchItem.accessibilityInformation = { label: `Ramas y acciones Git [ijt:${port}:${token}]`, role: 'button' };
  });
  ctx.subscriptions.push({ dispose: () => server.close() });
}

module.exports = { start };
