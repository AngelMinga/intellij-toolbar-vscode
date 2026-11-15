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
const menus = require('./menus');
const { runGit } = menus;

async function repoOrThrow() {
  const repo = menus.currentRepo(await menus.gitApiAsync());
  if (!repo) throw new Error('No hay un repositorio Git abierto.');
  return repo;
}

// ---- Varios repositorios (como IntelliJ "Execute branch operations on all roots")

/** Repositorios sobre los que actúan las operaciones de rama: todos si la sincronización está activa. */
async function targetRepos() {
  const api = await menus.gitApiAsync();
  const current = menus.currentRepo(api);
  if (!current) throw new Error('No hay un repositorio Git abierto.');
  const sync = vscode.workspace.getConfiguration('intellijToolbar').get('syncBranchOperations', true);
  if (!sync || api.repositories.length < 2) return [current];
  // El actual primero, para que sus errores se vean antes.
  return [current, ...api.repositories.filter(r => r !== current)];
}

const repoName = repo => path.basename(repo.rootUri.fsPath);

async function hasRef(repo, ref, remote) {
  const refs = await repo.getRefs({ pattern: remote ? `refs/remotes/${ref}` : `refs/heads/${ref}` });
  return refs.some(r => r.name === ref);
}

// Repositorios que se procesan a la vez: cada uno es independiente, pero sin límite podrían salir
// varias peticiones de credenciales juntas y saturar la red o el disco.
const REPO_CONCURRENCY = 4;

/**
 * Ejecuta `fn` en cada repositorio (opcionalmente solo en los que tienen `needRef`) y muestra un resumen:
 * en cuántos se hizo, cuáles no tienen la rama y cuáles fallaron. Hasta REPO_CONCURRENCY en paralelo;
 * los resúmenes conservan el orden de `repos` (el actual primero).
 */
async function forEachRepo(title, repos, fn, needRef) {
  const results = new Array(repos.length); // 'done' | 'skipped' | mensaje de error
  await withProgress(title, async progress => {
    const running = new Set();
    const report = () => progress.report({ message: [...running].join(', ') });
    let next = 0;
    const worker = async () => {
      while (next < repos.length) {
        const i = next++;
        const repo = repos[i];
        const name = repoName(repo);
        running.add(name); report();
        try {
          if (needRef && !(await needRef(repo))) { results[i] = 'skipped'; continue; }
          try { await fn(repo); results[i] = 'done'; }
          catch (e) { results[i] = { error: `${name}: ${(e && (e.stderr || e.message)) || e}`.split('\n')[0] }; }
          await refresh(repo);
        } catch (e) {
          results[i] = { error: `${name}: ${(e && e.message) || e}`.split('\n')[0] }; // falló needRef
        } finally {
          running.delete(name); report();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(REPO_CONCURRENCY, repos.length) }, worker));
  });
  const done = [], skipped = [], failed = [];
  results.forEach((r, i) => {
    const name = repoName(repos[i]);
    if (r === 'done') done.push(name);
    else if (r === 'skipped') skipped.push(name);
    else failed.push(r.error);
  });
  if (repos.length < 2) {
    if (failed.length) throw new Error(failed[0].replace(/^[^:]+: /, ''));
    return { done, skipped, failed };
  }
  const parts = [`${title.replace(/…$/, '')}: ${done.length} de ${repos.length} repositorios.`];
  if (skipped.length) parts.push(`Sin la rama: ${skipped.join(', ')}.`);
  if (failed.length) parts.push(`Con error: ${failed.join(' · ')}`);
  (failed.length ? vscode.window.showWarningMessage : vscode.window.showInformationMessage)(parts.join(' '));
  return { done, skipped, failed };
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

// Ramas locales (con upstream y ahead/behind) y remotas de un repositorio, con un solo proceso git.
// `%(upstream:track)` da "[ahead 2, behind 1]", "[gone]" o vacío.
async function listRefs(root) {
  const out = await runGit(root, ['for-each-ref', '--sort=-committerdate',
    '--format=%(refname)%00%(upstream:short)%00%(upstream:track)', 'refs/heads', 'refs/remotes']);
  const local = [], remote = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [ref, upstream, track] = line.split('\0');
    if (ref.startsWith('refs/heads/')) {
      const ahead = /ahead (\d+)/.exec(track), behind = /behind (\d+)/.exec(track);
      local.push({
        name: ref.slice('refs/heads/'.length),
        upstream: upstream || null,
        ahead: ahead ? +ahead[1] : 0,
        behind: behind ? +behind[1] : 0
      });
    } else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) {
      remote.push(ref.slice('refs/remotes/'.length));
    }
  }
  return { local, remote };
}

async function getBranches() {
  const repos = await targetRepos();
  const repo = repos[0]; // el actual
  const root = repo.rootUri.fsPath;
  const head = repo.state.HEAD ? (repo.state.HEAD.name || null) : null;
  // Un for-each-ref por repositorio, en paralelo. Si falla otro que no sea el actual, se ignora.
  const perRepo = await Promise.all(repos.map((r, i) =>
    listRefs(r.rootUri.fsPath).catch(e => { if (i === 0) throw e; return { local: [], remote: [] }; })));
  // Ramas de todos los repositorios (sin duplicados); los datos de seguimiento salen del primero que la tenga.
  const seen = new Map(), remoteSet = new Set();
  for (const { local, remote } of perRepo) {
    for (const b of local) if (!seen.has(b.name)) seen.set(b.name, b);
    for (const n of remote) remoteSet.add(n);
  }
  const local = [...seen.values()];
  const remotes = [...remoteSet];
  const localNames = new Set(seen.keys());

  const recent = await menus.recentBranches(root, localNames, 5);
  if (head && localNames.has(head) && !recent.includes(head)) recent.unshift(head);

  return { head, root: path.basename(root), recent, local, remote: remotes, repos: repos.length };
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
  update: async () => {
    const repos = await targetRepos();
    if (repos.length < 2) return vscode.commands.executeCommand('git.pull');
    await forEachRepo('Update Project…', repos, r => r.pull());
  },
  commit: () => vscode.commands.executeCommand('workbench.view.scm'),
  push: () => vscode.commands.executeCommand('git.push'),
  fetch: async () => {
    const repos = await targetRepos();
    if (repos.length < 2) return withProgress('git fetch…', () => repos[0].fetch());
    await forEachRepo('git fetch…', repos, r => r.fetch());
  },
  newWorktree: () => vscode.commands.executeCommand('git.createWorktree'),
  checkoutTag: () => vscode.commands.executeCommand('git.checkoutDetached'),
  rename: () => vscode.commands.executeCommand('git.renameBranch'),
  // Columna de ventanas de herramientas: click sobre la ventana ya abierta la cierra (como IntelliJ).
  closePanel: () => vscode.commands.executeCommand('workbench.action.closePanel'),
  closeAuxiliaryBar: () => vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar'),

  newBranch: async ({ ref, remote }) => {
    const repos = await targetRepos();
    if (repos.length < 2) return menus.newBranch(repos[0], ref || undefined);
    const name = await vscode.window.showInputBox({
      prompt: ref ? `Nueva rama desde '${ref}' en todos los repositorios` : 'Nueva rama desde la actual, en todos los repositorios',
      placeHolder: 'feature/mi-rama',
      validateInput: v => /^[^\s~^:?*[\\]+$/.test(v || '') ? undefined : 'Nombre de rama inválido'
    });
    if (!name) return;
    // El menú indica si `ref` es remota; no se adivina por el "/" (las locales también lo llevan).
    await forEachRepo(`Nueva rama ${name}…`, repos, r => r.createBranch(name, true, ref || undefined),
      ref ? r => hasRef(r, ref, !!remote) : undefined);
  },

  checkout: async ({ ref, remote }) => {
    const repos = await targetRepos();
    const local = remote ? splitRemote(ref).branch : ref;
    await forEachRepo(`Checkout ${local}…`, repos, r => checkoutRef(r, ref, remote),
      async r => (await hasRef(r, ref, remote)) || (remote && (await hasRef(r, local, false))));
  },

  checkoutRebase: async ({ ref, remote }) => {
    const repos = await targetRepos();
    await forEachRepo(`Checkout ${ref} y rebase…`, repos, async r => {
      const head = r.state.HEAD && r.state.HEAD.name;
      if (!head) throw new Error('No hay una rama actual.');
      await checkoutRef(r, ref, remote);
      await runGit(r.rootUri.fsPath, ['rebase', head]);
    }, r => hasRef(r, ref, remote));
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
    const out = await runGit(repo.rootUri.fsPath, ['diff', ref, '--']); // "--": ref, no ruta
    await showText(out || `Sin diferencias entre '${ref}' y el working tree.\n`, 'diff');
  },

  rebaseOnto: async ({ ref, remote }) => {
    await forEachRepo(`Rebase sobre ${ref}…`, await targetRepos(), r => runGit(r.rootUri.fsPath, ['rebase', ref]),
      r => hasRef(r, ref, remote));
  },

  merge: async ({ ref, remote }) => {
    await forEachRepo(`Merge ${ref}…`, await targetRepos(), r => r.merge(ref), r => hasRef(r, ref, remote));
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
    const { remote, branch } = splitRemote(ref);
    await forEachRepo(`Pull ${ref} (rebase)…`, await targetRepos(),
      r => runGit(r.rootUri.fsPath, ['pull', '--rebase', remote, branch]), r => hasRef(r, ref, true));
  },

  pullMerge: async ({ ref }) => {
    const { remote, branch } = splitRemote(ref);
    await forEachRepo(`Pull ${ref} (merge)…`, await targetRepos(),
      r => runGit(r.rootUri.fsPath, ['pull', '--no-rebase', remote, branch]), r => hasRef(r, ref, true));
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
    const repos = await targetRepos();
    const where = repos.length > 1 ? ' en todos los repositorios que la tengan' : '';
    const ok = await vscode.window.showWarningMessage(`¿Eliminar la rama local '${ref}'${where}?`, { modal: true }, 'Eliminar');
    if (!ok) return;
    const unmerged = [];
    await forEachRepo(`Eliminar ${ref}…`, repos, async r => {
      try { await r.deleteBranch(ref, false); }
      catch (e) {
        // Solo "no fusionada" admite forzar; cualquier otro error (p. ej. abierta en un worktree) se informa tal cual.
        const msg = String((e && (e.stderr || e.message)) || e);
        if (!(e && e.gitErrorCode === 'BranchNotFullyMerged') && !/not fully merged/i.test(msg)) throw e;
        unmerged.push(r);
        throw new Error('no está fusionada');
      }
    }, r => hasRef(r, ref, false));
    if (!unmerged.length) return;
    const force = await vscode.window.showWarningMessage(
      `'${ref}' no está fusionada en: ${unmerged.map(repoName).join(', ')}. ¿Eliminarla de todas formas? Se perderán sus commits no fusionados.`,
      { modal: true }, 'Forzar eliminación');
    if (force) await forEachRepo(`Eliminar ${ref} (forzado)…`, unmerged, r => r.deleteBranch(ref, true));
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
