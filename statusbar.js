// Barra de estado estilo IntelliJ (New UI):
//  - Izquierda: ruta de navegación  proyecto › carpeta › … › archivo › símbolo  (clic: archivos de esa carpeta).
//  - Derecha: posición "13:1" (o "13:5 (25 chars)", "3 carets") e indentación "4 spaces" / "Tab".
// Los items equivalentes de VS Code (Ln/Col, Tab Size, lenguaje) los oculta titlebar-inject.js; sin la
// inyección quedan los dos, sin perder nada.
const vscode = require('vscode');
const path = require('path');
const { updateItem } = require('./menus');

const { Left: L, Right: R } = vscode.StatusBarAlignment;
const SEP = ' › ';
const MAX_DIRS = 4; // carpetas visibles antes del archivo; las de más arriba se resumen en "…"

function register(ctx) {
  const mk = (id, name, align, prio, command, tooltip) => {
    const it = vscode.window.createStatusBarItem(id, align, prio);
    it.name = `IntelliJ Toolbar: ${name}`;
    it.command = command;
    it.tooltip = tooltip;
    ctx.subscriptions.push(it);
    return it;
  };
  // Prioridades: VS Code usa 100.5 para Ln/Col y 100.4 para la indentación; estas quedan en su lugar.
  const nav = mk('ijt.navPath', 'Ruta de navegación', L, 10000, 'ijt.navPathOpen', 'Archivos de esta carpeta');
  const pos = mk('ijt.position', 'Posición', R, 100.55, 'workbench.action.gotoLine', 'Ir a línea:columna (⌘L)');
  const indent = mk('ijt.indent', 'Indentación', R, 100.45, 'changeEditorIndentation', 'Indentación del archivo');

  // ---- Ruta: carpetas y archivo (cambian al cambiar de editor) + símbolo bajo el cursor (con debounce).
  let navDir = '';   // carpeta del archivo relativa al proyecto, para el clic
  let filePart = ''; // texto de la ruta sin el símbolo
  let symbolTimer;
  // Símbolos por documento y versión: el proveedor solo se consulta si el archivo cambió.
  const symCache = new Map(); // uri → { version, symbols }

  const refreshPath = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme === 'output') { updateItem(nav, { visible: false }); filePart = ''; return; }
    const uri = ed.document.uri;
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const rel = folder ? path.relative(folder.uri.fsPath, uri.fsPath) : (uri.scheme === 'untitled' ? uri.path : path.basename(uri.fsPath));
    const parts = rel.split(path.sep).filter(Boolean);
    const file = parts.pop() || rel;
    navDir = parts.join('/');
    const dirs = parts.length > MAX_DIRS ? ['…', ...parts.slice(-MAX_DIRS)] : parts;
    filePart = [folder ? folder.name : null, ...dirs, file].filter(Boolean).join(SEP);
    updateItem(nav, { text: filePart, tooltip: [folder ? folder.name : '', rel].filter(Boolean).join(path.sep) });
    scheduleSymbol(0);
    // Recién abierto (o al arrancar VS Code) el proveedor de símbolos puede no estar listo: segundo intento.
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => scheduleSymbol(0), 2500);
  };
  let retryTimer;

  async function symbolsOf(doc) {
    const key = doc.uri.toString();
    const c = symCache.get(key);
    if (c && c.version === doc.version) return c.symbols;
    let symbols = [];
    try { symbols = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri)) || []; }
    catch { /* sin proveedor */ }
    // Una lista vacía no se guarda: al arrancar, el servidor de lenguaje (TypeScript, Dart…) aún no responde
    // y se volvería a preguntar solo al editar. Así se reintenta en el próximo movimiento del cursor.
    if (symbols.length) symCache.set(key, { version: doc.version, symbols });
    if (symCache.size > 30) symCache.delete(symCache.keys().next().value);
    return symbols;
  }

  // Cadena de símbolos que contienen la posición (Clase › método). Solo DocumentSymbol (con hijos).
  function chainAt(symbols, position) {
    const out = [];
    let level = symbols;
    while (level && level.length) {
      const s = level.find(x => x.range && x.range.contains(position));
      if (!s) break;
      out.push(s.name);
      level = s.children;
    }
    return out;
  }

  const scheduleSymbol = delay => {
    clearTimeout(symbolTimer);
    symbolTimer = setTimeout(async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || !filePart) return;
      const symbols = await symbolsOf(ed.document);
      if (ed !== vscode.window.activeTextEditor) return; // cambió de editor mientras tanto
      const chain = chainAt(symbols, ed.selection.active);
      updateItem(nav, { text: chain.length ? filePart + SEP + chain.slice(-2).join(SEP) : filePart });
    }, delay);
  };

  // ---- Posición e indentación
  let posTimer;
  const refreshPosition = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) { updateItem(pos, { visible: false }); return; }
    const sels = ed.selections;
    const a = sels[0].active;
    let text = `${a.line + 1}:${a.character + 1}`;
    if (sels.length > 1) text = `${sels.length} carets`;
    else if (!sels[0].isEmpty) {
      const chars = ed.document.getText(sels[0]).length;
      const lines = sels[0].end.line - sels[0].start.line;
      text += lines ? ` (${chars} chars, ${lines} line break${lines > 1 ? 's' : ''})` : ` (${chars} chars)`;
    }
    updateItem(pos, { text });
  };
  const refreshIndent = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) { updateItem(indent, { visible: false }); return; }
    const { insertSpaces, tabSize } = ed.options;
    updateItem(indent, { text: insertSpaces ? `${tabSize} spaces` : 'Tab' });
  };

  const refreshAll = () => { refreshPath(); refreshPosition(); refreshIndent(); };

  ctx.subscriptions.push(
    vscode.commands.registerCommand('ijt.navPathOpen', () =>
      vscode.commands.executeCommand('workbench.action.quickOpen', navDir ? navDir + '/' : '')),
    vscode.window.onDidChangeActiveTextEditor(refreshAll),
    // Al mover el cursor: la posición casi en el acto; el símbolo, cuando se detiene.
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (e.textEditor !== vscode.window.activeTextEditor) return;
      clearTimeout(posTimer);
      posTimer = setTimeout(refreshPosition, 50);
      scheduleSymbol(250);
    }),
    vscode.window.onDidChangeTextEditorOptions(e => { if (e.textEditor === vscode.window.activeTextEditor) refreshIndent(); }),
    vscode.workspace.onDidCloseTextDocument(doc => symCache.delete(doc.uri.toString())),
    { dispose: () => { clearTimeout(symbolTimer); clearTimeout(posTimer); clearTimeout(retryTimer); } }
  );
  refreshAll();
}

module.exports = { register };
