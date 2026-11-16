// Mueve los botones "proyecto" y "rama" de IntelliJ Toolbar desde la barra de estado
// a la barra de título (izquierda), estilo IntelliJ. Se carga con Custom CSS and JS Loader.
(function () {
  'use strict';

  // Items de la barra de estado que se mueven a la barra de título, en orden.
  const LEFT_IDS = ['ijt.project', 'ijt.branchMenu'];
  // Device, configuración, Run, Debug y Stop: extensión run-configurations. Hot Reload/Restart y ⋮: intellij-toolbar.
  const RIGHT_IDS = ['runConfigurations.device', 'runConfigurations.selector', 'runConfigurations.run',
    'runConfigurations.debug', 'runConfigurations.stop', 'ijt.reloadBtn', 'ijt.restartBtn', 'ijt.moreBtn', 'ijt.searchBtn', 'ijt.settingsBtn'];
  const DEVICE_SEL = '[id$=".runConfigurations.device"]';
  // Columna de ventanas de herramientas (pie de la barra de actividad, como IntelliJ) y el nombre de la
  // pestaña del panel inferior que corresponde a cada una (para resaltar la que está abierta).
  const TOOL_WINDOWS = [
    { id: 'ijt.tw.run', tabs: ['Debug Console'], tip: 'Run  ⌘4' },
    { id: 'ijt.tw.terminal', tabs: ['Terminal'], tip: 'Terminal  ⌥F12' },
    { id: 'ijt.tw.output', tabs: ['Output'], tip: 'Output' },
    { id: 'ijt.tw.problems', tabs: ['Problems'], tip: 'Problems  ⌘6' },
    { id: 'ijt.tw.todo', tabs: ['TODO'], tip: 'TODO' },
    { id: 'ijt.tw.git', tabs: ['MultiGit', 'Source Control'], tip: 'Git  ⌘9' }
  ];
  // ⋮ "More Tool Windows": justo debajo de los íconos de arriba (Project, Commit, Structure…), como IntelliJ.
  // Abre el menú de pins.js; lo que se elige ahí queda fijado en la columna (encima del ⋮). pins.js publica
  // cuáles en el aria-label del ⋮: "[ijt-pins:<key>=<aria-label nativo>|…;<key>|…]" (ver pinState).
  const MORE_TW = { id: 'ijt.tw.more', tip: 'More Tool Windows' };
  // Columna derecha de IntelliJ: franja vertical en el borde derecho de la ventana. VS Code se acomoda
  // dejándole RIGHT_STRIPE_W px (ver reserveRightStripe). `close`: op del puente para cerrar al pulsar lo activo.
  const RIGHT_STRIPE_W = 36;
  const RIGHT_ITEMS = [
    { id: 'ijt.rw.notifications', tip: 'Notifications', active: () => !!document.querySelector('.notifications-center.visible') },
    { id: 'ijt.rw.devices', tip: 'Running Devices', active: () => auxTitle().startsWith('PhonePane'), close: () => 'closeAuxiliaryBar' },
    { id: 'ijt.rw.inspector', tip: 'Flutter Inspector', active: () => false },
    {
      id: 'ijt.rw.ai',
      tip: 'AI Chat (Claude Code)',
      active: () => auxTitle().startsWith('Claude') || (activePanelTab() || '').startsWith('Claude'),
      close: () => (auxTitle().startsWith('Claude') ? 'closeAuxiliaryBar' : 'closePanel')
    }
  ];
  const STRIPE_VARS = ['--vscode-activityBar-background', '--vscode-activityBar-border', '--vscode-activityBar-foreground',
    '--vscode-activityBar-inactiveForeground', '--vscode-toolbar-hoverBackground', '--vscode-toolbar-activeBackground',
    '--vscode-titleBar-activeBackground', '--vscode-statusBar-background', '--vscode-statusBar-border'];
  const SELECTOR_SEL = '[id$=".runConfigurations.selector"]';
  const FLUTTER_SVG = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<path fill='%2347C5FB' d='M14.31 1.5 3.6 12.21l3.31 3.31L20.93 1.5z'/>" +
    "<path fill='%2347C5FB' d='M14.31 11.43 8.58 17.16l3.33 3.28 3.3-3.3 5.72-5.71z'/>" +
    "<path fill='%2300569E' d='m11.91 20.44 2.4 2.4h6.62l-5.72-5.72z'/>" +
    "<path fill='%2300B5F8' d='m8.58 17.16 3.32-3.32 3.31 3.3-3.3 3.3z'/></svg>\")";
  const COLORS = ['#c27d2e', '#3d8f58', '#3c7fc4', '#9a5ac7', '#c4515f', '#2e9a9a', '#b5a032'];

  // Islas: separación con el marco (entre dos islas queda el doble) y radio de las esquinas.
  const ISLAND_GAP = 3;
  const ISLAND_RADIUS = 10;
  // Títulos de la barra lateral que IntelliJ llama distinto (solo el texto visible; VS Code en inglés).
  // MultiGit (repositorios, cambios, commit y ramas en la barra lateral) hace de ventana Commit de IntelliJ.
  // Outline: el contenedor "Structure" tiene una sola vista y VS Code le pone el nombre de esa vista.
  const TITLE_RENAMES = { Explorer: 'Project', 'Source Control': 'Commit', MultiGit: 'Commit', Outline: 'Structure' };
  // Columna izquierda de arriba como IntelliJ: Project, Commit, Structure, Bookmarks primero (en ese orden).
  // Search, Extensions y Run and Debug se ocultan del ícono (siguen con sus atajos: ⇧⌘F, el ⚙ → Plugins, y
  // la depuración abre su vista sola). Se reconocen por el aria-label del ícono ("Search (⇧⌘F)", …).
  // Cada posición admite varios nombres: Commit es MultiGit si está instalado, si no Source Control.
  const ACTIVITY_ORDER = [['Explorer'], ['MultiGit', 'Source Control'], ['Structure', 'Outline'], ['Bookmarks']];
  const ACTIVITY_HIDDEN = ['Search', 'Extensions', 'Run and Debug'];
  const activityItem = label => `.monaco-workbench .part.activitybar .composite-bar .action-item:has(> .action-label[aria-label^="${label}"])`;

  const css = `
    .ijt-titlebar-host {
      display: flex; align-items: center; gap: 2px; height: 100%;
      flex-shrink: 0; -webkit-app-region: no-drag; order: 1;
      /* Por encima de .titlebar-drag-region (capa de arrastre de la ventana), igual que los botones nativos */
      position: relative; z-index: 2500;
    }
    .ijt-titlebar-host, .ijt-titlebar-host * { -webkit-app-region: no-drag !important; }
    .ijt-titlebar-host .statusbar-item {
      display: flex !important; align-items: center; height: 26px;
      border-radius: 6px; padding: 0 6px; cursor: pointer;
      background: transparent !important; color: var(--vscode-titleBar-activeForeground);
      font-size: 13px; -webkit-app-region: no-drag;
    }
    .ijt-titlebar-host .statusbar-item:hover {
      background: var(--vscode-toolbar-hoverBackground) !important;
    }
    .ijt-titlebar-host .statusbar-item > a {
      display: flex !important; align-items: center; gap: 4px; padding: 0 !important;
      color: inherit !important; background: transparent !important; text-decoration: none;
    }
    .ijt-titlebar-host .statusbar-item .codicon { font-size: 14px !important; }
    .ijt-titlebar-host .statusbar-item .codicon-chevron-down { font-size: 12px !important; opacity: .75; }
    .ijt-titlebar-host [id$=".ijt.project"] .codicon-folder { display: none !important; }
    .ijt-titlebar-host [id$=".ijt.branchMenu"] .codicon-git-branch { color: var(--vscode-titleBar-activeForeground); }
    .ijt-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 20px; height: 18px; padding: 0 3px; border-radius: 4px;
      font-size: 10px; font-weight: 700; color: #fff; margin-right: 4px; letter-spacing: .2px;
    }
    .ijt-titlebar-host .ijt-name { font-weight: 600; }

    /* ---- lado derecho: device, configuración, run, debug… */
    .ijt-titlebar-host.ijt-right { margin-right: 6px; order: 0; }
    .ijt-right .statusbar-item { padding: 0 5px; }
    .ijt-right ${DEVICE_SEL} > a {
      display: block !important; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ijt-right ${DEVICE_SEL} > a .codicon { vertical-align: -2px; margin-right: 4px; color: #6ea6f7; }
    .ijt-right ${DEVICE_SEL} > a .codicon-warning { color: #e5c07b; }
    .ijt-right .ijt-chev { font-size: 12px !important; opacity: .75; margin-left: 2px; }
    .ijt-right ${SELECTOR_SEL} { margin-left: 4px; }
    /* Una sola línea con "…" si el nombre no cabe; la flecha ⌄ va fuera del texto para que nunca se corte. */
    .ijt-right ${SELECTOR_SEL} > a {
      display: block !important; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ijt-right ${SELECTOR_SEL} > a .codicon { vertical-align: -2px; margin-right: 4px; }
    .ijt-right ${SELECTOR_SEL} > a .codicon-chevron-down { display: none !important; }
    .ijt-right ${DEVICE_SEL} > a .codicon-chevron-down { display: none !important; }
    /* Configuraciones Flutter: el ícono device-mobile se reemplaza por el logo de Flutter */
    .ijt-right ${SELECTOR_SEL} .codicon-device-mobile {
      width: 14px; height: 14px; background: ${FLUTTER_SVG} center / 14px 14px no-repeat;
    }
    .ijt-right ${SELECTOR_SEL} .codicon-device-mobile::before { content: '' !important; }
    .ijt-right [id$=".runConfigurations.run"], .ijt-right [id$=".runConfigurations.debug"],
    .ijt-right [id$=".runConfigurations.stop"], .ijt-right [id$=".ijt.reloadBtn"],
    .ijt-right [id$=".ijt.restartBtn"], .ijt-right [id$=".ijt.moreBtn"], .ijt-right [id$=".ijt.searchBtn"],
    .ijt-right [id$=".ijt.settingsBtn"] {
      width: 26px; padding: 0 !important; justify-content: center;
    }
    .ijt-right [id$=".runConfigurations.run"] { margin-left: 4px; }
    .ijt-right [id$=".runConfigurations.run"] .codicon { color: #5fb865 !important; }
    .ijt-right [id$=".runConfigurations.debug"] .codicon { color: #e0657a !important; }
    .ijt-right [id$=".runConfigurations.stop"] .codicon { color: #e06c75 !important; }
    .ijt-right [id$=".ijt.reloadBtn"] { margin-left: 6px; }
    .ijt-right [id$=".ijt.reloadBtn"] .codicon { color: #e5c07b !important; }
    .ijt-right [id$=".ijt.restartBtn"] .codicon { color: #5fb865 !important; }
    .ijt-right .statusbar-item .codicon { font-size: 15px !important; }

    /* ---- Buscador del centro (command center): se oculta; su función la cumple la lupa de la derecha
       (botón ijt.searchBtn → workbench.action.quickOpenWithModes). Los otros íconos que VS Code pone
       en esa zona (p. ej. chat) se mantienen, sin el marco de la caja. */
    .monaco-workbench .part.titlebar .command-center .command-center-quick-pick { display: none !important; }
    .monaco-workbench .part.titlebar > .titlebar-container > .titlebar-center > .window-title > .command-center .action-item.command-center-center {
      width: auto !important; min-width: 0 !important; max-width: none !important;
      border-color: transparent !important; background: transparent !important;
    }
    .monaco-workbench .part.titlebar .command-center .action-item.command-center-center.multiple { padding: 0 !important; }
    .ijt-right [id$=".ijt.searchBtn"] { margin-left: 2px; }

    /* ---- Columna de ventanas de herramientas al pie de la barra de actividad */
    .ijt-toolwindows {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 6px 0; margin: 4px 6px 0; border-top: 1px solid var(--vscode-activityBar-border, rgba(128,128,128,.25));
    }
    .ijt-toolwindows .statusbar-item {
      display: flex !important; align-items: center; justify-content: center;
      width: 30px; height: 30px; padding: 0 !important; border-radius: 6px; cursor: pointer;
      background: transparent !important; color: var(--vscode-activityBar-inactiveForeground) !important;
    }
    .ijt-toolwindows .statusbar-item > a {
      display: flex !important; align-items: center; justify-content: center; padding: 0 !important;
      color: inherit !important; background: transparent !important;
    }
    .ijt-toolwindows .statusbar-item .codicon { font-size: 18px !important; }
    .ijt-toolwindows .statusbar-item:hover { background: var(--vscode-toolbar-hoverBackground) !important; color: var(--vscode-activityBar-foreground) !important; }
    .ijt-toolwindows.ijt-tw-more { border-top: none; margin: 2px 0 0; padding: 0; }
    .ijt-toolwindows .statusbar-item.ijt-active {
      background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,.25)) !important;
      color: var(--vscode-activityBar-foreground) !important;
    }

    /* ---- Columna derecha (Notifications, Running Devices, Flutter Inspector, AI) */
    #ijt-rightstripe {
      position: fixed; top: 0; right: 0; bottom: 0; width: ${RIGHT_STRIPE_W}px; z-index: 2400;
      display: flex; flex-direction: column; -webkit-app-region: no-drag;
      background: var(--vscode-activityBar-background);
      border-left: 1px solid var(--vscode-activityBar-border, rgba(128,128,128,.2)); box-sizing: border-box;
    }
    #ijt-rightstripe .ijt-rs-top { flex: none; background: var(--vscode-titleBar-activeBackground); -webkit-app-region: drag; }
    #ijt-rightstripe .ijt-rs-bottom { flex: none; margin-top: auto; background: var(--vscode-statusBar-background); }
    #ijt-rightstripe .ijt-toolwindows { border-top: none; margin: 0; padding: 8px 0; }

    /* ---- Pestañas del editor al estilo Islands (IntelliJ). Con las pestañas "modern UI" de VS Code
       (.modern-ui-tabs, altura fija) la activa se dibuja con .tab-fill y bordes que la conectan al editor:
       se da forma de recuadro redondeado a ese relleno (EditorTabs: fondo #233558, borde #2E4D89) y se
       ocultan los bordes de conexión. La activa de otro grupo queda en gris. */
    .monaco-workbench .part.editor .tabs-container > .tab > :is(.tab-connected-edge, .tab-connected-overflow-edge, .tab-connected-overflow-right-edge) {
      display: none !important;
    }
    .monaco-workbench .part.editor .tabs-container > .tab.active > .tab-fill::before,
    .monaco-workbench .part.editor .tabs-container > .tab.active > .tab-fill::after { display: none !important; }
    .monaco-workbench .part.editor .tabs-container > .tab.active > .tab-fill {
      /* arriba 4px: libra el borde de ${ISLAND_GAP}px de la isla del editor */
      position: absolute !important; inset: 4px 2px 2px !important; border-radius: 6px !important;
      background: #26282C !important; box-shadow: inset 0 0 0 1px #40434A !important;
    }
    .monaco-workbench .part.editor .editor-group-container.active .tabs-container > .tab.active > .tab-fill {
      background: #233558 !important; box-shadow: inset 0 0 0 1px #2E4D89 !important;
    }
    .monaco-workbench .part.editor .tabs-container > .tab { border-right: none !important; }
    .monaco-workbench .part.editor .tabs-container > .tab > .tab-divider { display: none !important; }

    /* ---- Islas (IntelliJ 2025 "Islands"): barra lateral, editor, panel y barra auxiliar como tarjetas
       redondeadas sobre el color del marco (el de la barra de actividad / título / estado).
       No se tocan márgenes ni tamaños (VS Code calcula el diseño en píxeles y se descuadraría): se pinta
       encima de cada parte una capa sin eventos de ratón cuya sombra, con el color del marco, cubre los
       ${ISLAND_GAP}px del borde y las esquinas. Entre dos islas quedan ${ISLAND_GAP * 2}px. isolation: la capa
       no tapa los sashes (bordes para redimensionar) ni nada fuera de su parte. */
    .monaco-workbench .monaco-grid-view { background: var(--vscode-activityBar-background) !important; }
    .monaco-workbench .split-view-view:is(:has(> .part.sidebar), :has(> .part.editor), :has(> .part.panel), :has(> .part.auxiliarybar)) {
      isolation: isolate; overflow: hidden;
    }
    .monaco-workbench .split-view-view:is(:has(> .part.sidebar), :has(> .part.editor), :has(> .part.panel), :has(> .part.auxiliarybar))::after {
      content: ''; position: absolute; inset: ${ISLAND_GAP}px; z-index: 35; pointer-events: none;
      border-radius: ${ISLAND_RADIUS}px;
      box-shadow: 0 0 0 ${ISLAND_GAP + ISLAND_RADIUS}px var(--vscode-activityBar-background);
    }

    /* ---- Columna izquierda de arriba (barra de actividad): orden y elementos ocultos, ver ACTIVITY_ORDER.
       VS Code pone la lista vertical como inline-block, donde "order" no hace nada: se pasa a flex en columna. */
    .monaco-workbench .part.activitybar .composite-bar .monaco-action-bar.vertical .actions-container {
      display: flex !important; flex-direction: column;
    }
    ${ACTIVITY_ORDER.map((names, i) => `${names.map(activityItem).join(', ')} { order: ${i - ACTIVITY_ORDER.length}; }`).join('\n    ')}
    /* Los de ACTIVITY_HIDDEN se ocultan desde <style id="ijt-activity-hidden"> (ver applyActivityHidden): los
       que se fijan desde el ⋮ vuelven a verse. */
    .ijt-toolwindows .statusbar-item.ijt-dup { display: none !important; }
    #ijt-ctx {
      position: fixed; z-index: 2700; min-width: 170px; padding: 4px; border-radius: 6px;
      background: var(--vscode-menu-background, #2B2D30); color: var(--vscode-menu-foreground, #DFE1E5);
      border: 1px solid var(--vscode-menu-border, #43454A); box-shadow: 0 6px 18px var(--vscode-widget-shadow, rgba(0,0,0,.4));
      font-size: 13px; -webkit-app-region: no-drag;
    }
    #ijt-ctx div { padding: 4px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
    #ijt-ctx div:hover { background: var(--vscode-menu-selectionBackground, #2E436E); color: var(--vscode-menu-selectionForeground, inherit); }

    /* ---- Barra de estado como IntelliJ: "13:1" y "4 spaces" (statusbar.js) en lugar de "Ln 13, Col 1" y
       "Tab Size: 4"; sin el lenguaje ni su indicador {}. Solo si los de la extensión están (:has). */
    .monaco-workbench .part.statusbar:has([id$=".ijt.position"]) .statusbar-item[id="status.editor.selection"],
    .monaco-workbench .part.statusbar:has([id$=".ijt.indent"]) .statusbar-item[id="status.editor.indentation"],
    .monaco-workbench .part.statusbar .statusbar-item:is([id="status.editor.mode"], [id="status.languageStatus"]) {
      display: none !important;
    }
    .monaco-workbench .part.statusbar .statusbar-item[id$=".ijt.navPath"] { max-width: 50vw; }
    .monaco-workbench .part.statusbar .statusbar-item[id$=".ijt.navPath"] > a {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .9;
    }

    /* ---- Fuente de la interfaz: Inter, como la New UI de IntelliJ (si no está instalada, la del sistema).
       Solo la interfaz: el editor y la terminal fijan su propia fuente (JetBrains Mono). */
    .monaco-workbench.monaco-workbench {
      font-family: Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif !important;
    }

    /* ---- Títulos de las ventanas de herramientas sin mayúsculas, como IntelliJ ("Project", no "EXPLORER"):
       título de la barra lateral y auxiliar, pestañas del panel y cabeceras de secciones. */
    .monaco-workbench .part > .title .title-label,
    .monaco-workbench .part > .title .title-label h2,
    .monaco-workbench .part > .title .action-item .action-label,
    .monaco-workbench .pane > .pane-header .title,
    .monaco-workbench .pane > .pane-header .description { text-transform: none !important; }
    .monaco-workbench .part > .title .title-label h2 { font-size: 13px !important; font-weight: 600 !important; }
    .monaco-workbench .part > .title .action-item .action-label:not(.codicon) { font-size: 13px !important; }
    .monaco-workbench .pane > .pane-header .title { font-size: 12px !important; font-weight: 600 !important; }

    /* ---- Tooltip propio de las columnas (el de VS Code se posiciona mal fuera de su área) */
    #ijt-tooltip {
      position: fixed; z-index: 2700; pointer-events: none; white-space: nowrap;
      padding: 4px 8px; border-radius: 6px; font-size: 12px; line-height: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,.35); opacity: 0; transition: opacity .08s;
    }
    #ijt-tooltip.show { opacity: 1; }

    /* ---- Widget de inspecciones: arriba a la derecha del editor activo, como IntelliJ */
    .ijt-inspections-host { position: absolute; top: 4px; right: 18px; z-index: 10; pointer-events: none; }
    .ijt-inspections-host:empty { display: none; }
    .ijt-inspections-host .statusbar-item {
      display: flex !important; align-items: center; height: 20px; padding: 0 6px !important; border-radius: 4px;
      pointer-events: auto; cursor: pointer; font-size: 12px; opacity: .85;
      background: var(--vscode-editorWidget-background) !important; color: var(--vscode-editor-foreground) !important;
    }
    .ijt-inspections-host .statusbar-item:hover { opacity: 1; }
    .ijt-inspections-host .statusbar-item > a {
      display: flex !important; align-items: center; gap: 3px; padding: 0 !important;
      color: inherit !important; background: transparent !important;
    }
    .ijt-inspections-host .codicon { font-size: 13px !important; }
    .ijt-inspections-host .codicon-error { color: var(--vscode-editorError-foreground) !important; }
    .ijt-inspections-host .codicon-warning { color: var(--vscode-editorWarning-foreground) !important; }
    .ijt-inspections-host .codicon-info { color: var(--vscode-editorInfo-foreground) !important; }
    .ijt-inspections-host .codicon-check { color: var(--vscode-testing-iconPassed, #73c991) !important; }

    /* El selector de device de la extensión Dart queda duplicado con el de la barra superior: se oculta abajo. */
    .monaco-workbench .part.statusbar .statusbar-item[id$=".dartStatusFlutterDevice"] { display: none !important; }

    /* VS Code con la barra unificada de agentes (.unified-agents-bar / .agent-status-enabled) no usa el
       buscador clásico sino una "píldora": flechas ← →, título (abre el buscador), búsqueda y chat.
       Se ocultan el título, su separador y la búsqueda; quedan las flechas y los íconos del chat. */
    .monaco-workbench .part.titlebar .command-center .action-item.agent-status-container {
      width: auto !important; max-width: none !important;
    }
    .monaco-workbench .part.titlebar .agent-status-pill {
      flex: none !important; background: transparent !important; border-color: transparent !important;
    }
    .monaco-workbench .part.titlebar .agent-status-pill .agent-status-input-area,
    .monaco-workbench .part.titlebar .agent-status-pill .agent-status-line-separator,
    .monaco-workbench .part.titlebar .agent-status-pill .agent-status-search { display: none !important; }
    .monaco-workbench .part.titlebar .agent-status-command-center-toolbar { background: transparent !important; }
  `;

  function initials(name) {
    const parts = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    const caps = name.match(/[A-Z]/g);
    if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
    return (name[0] || '?').toUpperCase();
  }

  function colorFor(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  function decorateProject(item) {
    const a = item.querySelector('a');
    if (!a) return;
    const name = (a.textContent || '').trim();
    if (!name) return;
    let badge = a.querySelector('.ijt-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ijt-badge';
      a.prepend(badge);
    }
    const clean = (badge.textContent ? name.slice(badge.textContent.length) : name).trim();
    const ini = initials(clean);
    if (badge.textContent !== ini) {
      badge.textContent = ini;
      badge.style.background = colorFor(clean);
    }
  }

  function ensureStyle() {
    if (document.getElementById('ijt-titlebar-style')) return;
    const s = document.createElement('style');
    s.id = 'ijt-titlebar-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureHost(side) {
    const zone = document.querySelector(`.part.titlebar .titlebar-${side}`);
    if (!zone) return null;
    let host = zone.querySelector(':scope > .ijt-titlebar-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ijt-titlebar-host' + (side === 'right' ? ' ijt-right' : '');
      if (side === 'right') zone.prepend(host); else zone.appendChild(host);
      host.addEventListener('mousedown', armAnchor, true);
      if (side === 'left') host.addEventListener('click', onHostClick, true);
      host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') armAnchor(e); }, true);
    }
    return host;
  }

  // Caché sufijo de id → item de la barra de estado. `[id$=…]` recorre todo el documento, así que se
  // busca solo si el elemento guardado ya no está en el DOM (VS Code lo recrea al ocultar/mostrar).
  const itemCache = new Map();
  function findItem(suffix) {
    const cached = itemCache.get(suffix);
    if (cached && cached.isConnected) return cached;
    const el = document.querySelector(`.statusbar-item[id$=".${suffix}"]`);
    if (el) itemCache.set(suffix, el); else itemCache.delete(suffix);
    return el;
  }

  // Coloca en el host los items presentes, en el orden de `ids`.
  function placeItems(host, ids) {
    const present = ids.map(findItem).filter(Boolean);
    present.forEach((el, idx) => {
      if (host.children[idx] !== el) host.insertBefore(el, host.children[idx] || null);
    });
    return present;
  }

  function decorateDevice(item) {
    if (item.querySelector(':scope > .ijt-chev')) return;
    const chev = document.createElement('span');
    chev.className = 'codicon codicon-chevron-down ijt-chev';
    item.appendChild(chev);
  }

  // ---- Abrir el buscador (quick pick) justo debajo del botón pulsado, como en IntelliJ.
  let anchor = null;     // { left, right, alignRight, top, at } pendiente de aplicar
  let placed = null;     // posición aplicada al widget visible
  let placedWidget = null;
  const watchedWidgets = new WeakSet();

  // La barra de título tiene "zoom: 1 / --zoom-factor" (clase counter-zoom) para no achicarse con
  // window.zoomLevel. Las medidas de sus botones salen en esa escala, distinta de la de la página
  // (donde viven los menús). Se convierte midiendo el factor real: contenedor (escala de la barra)
  // contra la barra completa (escala de la página).
  function pageRect(el) {
    const r = el.getBoundingClientRect();
    const container = el.closest('.titlebar-container');
    const part = container && container.parentElement;
    if (!container || !part) return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, k: 1 };
    const c = container.getBoundingClientRect();
    const p = part.getBoundingClientRect();
    const k = c.width ? p.width / c.width : 1;
    const kh = c.height ? p.height / c.height : k;
    const left = p.left + (r.left - c.left) * k;
    const top = p.top + (r.top - c.top) * kh;
    return { left, right: left + r.width * k, top, bottom: top + r.height * kh, width: r.width * k, height: r.height * kh, k };
  }

  function armAnchor(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item) return;
    const r = pageRect(item);
    const alignRight = !!item.closest('.ijt-right');
    anchor = { left: Math.round(r.left), right: Math.round(r.right), alignRight, top: Math.round(r.bottom + 4), at: Date.now() };
    dbgBudget = DEBUG ? 25 : 0;
    dbg('click', { item: item.id, rect: rectOf(item), page: { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), k: +r.k.toFixed(3) }, alignRight, widgets: document.querySelectorAll('.quick-input-widget').length });
    pollForWidget();
  }

  // Fija el ancla en un botón de la barra (p. ej. para los diálogos que abre el menú de ramas).
  function anchorTo(suffix, extraMs) {
    const item = document.querySelector(`.ijt-titlebar-host .statusbar-item[id$=".${suffix}"]`);
    if (!item) return;
    const r = pageRect(item);
    anchor = { left: Math.round(r.left), right: Math.round(r.right), alignRight: !!item.closest('.ijt-right'),
      top: Math.round(r.bottom + 4), at: Date.now() + (extraMs || 0) };
    pollForWidget();
  }

  // ---- Diagnóstico: tras cada click se envían unas pocas trazas a la extensión (archivo de log).
  // Poner en true para volver a registrar trazas en $TMPDIR/intellij-toolbar-debug.log
  const DEBUG = false;
  let dbgBudget = 0;
  function dbg(ev, data) {
    if (dbgBudget <= 0) return;
    dbgBudget--;
    callBridge('POST', '/log', Object.assign({ ev }, data)).catch(() => {});
  }
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  function describe(w) {
    const cs = getComputedStyle(w);
    const op = w.offsetParent;
    return {
      cls: w.className, display: cs.display, position: cs.position, transform: cs.transform,
      styleLeft: w.style.left, styleTop: w.style.top, rect: rectOf(w),
      offsetParent: op ? (op.className || op.tagName) : null, opRect: op ? rectOf(op) : null,
      widgets: document.querySelectorAll('.quick-input-widget').length, win: [window.innerWidth, window.innerHeight]
    };
  }

  function isVisible(w) {
    return getComputedStyle(w).display !== 'none' && w.getClientRects().length > 0;
  }

  function setPos(s, left, top) {
    const want = { left: Math.round(left) + 'px', top: Math.round(top) + 'px', right: 'auto', bottom: 'auto' };
    for (const [k, v] of Object.entries(want)) {
      if (s.getPropertyValue(k) !== v || s.getPropertyPriority(k) !== 'important') s.setProperty(k, v, 'important');
    }
  }

  // Coloca el widget y luego MIDE dónde quedó en pantalla y corrige la diferencia: así no importa
  // respecto a qué contenedor se posicione. La animación de apertura escala desde "top center",
  // por eso se compara el centro horizontal y el borde superior (no cambian al escalar).
  function applyPlacement(w) {
    const s = w.style;
    const width = w.offsetWidth || parseFloat(s.width) || 600;
    const wanted = placed.alignCenter ? (placed.left + placed.right) / 2 - width / 2
      : placed.alignRight ? placed.right - width : placed.left;
    const left = Math.max(8, Math.min(wanted, window.innerWidth - width - 8));
    const ours = s.getPropertyPriority('left') === 'important' && s.getPropertyPriority('top') === 'important';
    let cssLeft = ours ? parseFloat(s.left) : left;
    let cssTop = ours ? parseFloat(s.top) : placed.top;
    setPos(s, cssLeft, cssTop);
    const r = w.getBoundingClientRect();
    const dx = (left + width / 2) - (r.left + r.width / 2);
    const dy = placed.top - r.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      cssLeft += dx; cssTop += dy;
      setPos(s, cssLeft, cssTop);
    }
    dbg('apply', { want: { l: Math.round(left), t: placed.top, w: width }, css: [Math.round(cssLeft), Math.round(cssTop)], delta: [Math.round(dx), Math.round(dy)], after: rectOf(w) });
  }

  function clearPlacement(w) {
    ['left', 'top', 'right', 'bottom'].forEach(k => {
      if (w.style.getPropertyPriority(k) === 'important') w.style.removeProperty(k);
    });
  }

  function onWidgetChange(w) {
    if (anchor || placedWidget === w) dbg('change', Object.assign({ visible: isVisible(w), hasAnchor: !!anchor, mine: placedWidget === w }, describe(w)));
    if (!isVisible(w)) {
      if (placedWidget === w) {
        // Recordar la posición por si se abre enseguida un submenú (p. ej. acciones de una rama).
        anchor = Object.assign({}, placed, { at: Date.now() - 1500 });
        placed = null;
        placedWidget = null;
      }
      clearPlacement(w);
      return;
    }
    // Un click reciente siempre manda, aunque el widget siga abierto: VS Code reutiliza el mismo
    // widget al pasar de un menú a otro sin ocultarlo.
    if (anchor && Date.now() - anchor.at < 2000) {
      placed = { left: anchor.left, right: anchor.right, alignRight: anchor.alignRight, alignCenter: anchor.alignCenter, top: anchor.top };
      placedWidget = w;
      anchor = null;
    }
    if (placedWidget === w) applyPlacement(w);
  }

  // VS Code puede tener varios .quick-input-widget (uno por contenedor, chat, etc.): vigilarlos todos.
  function watchQuickInput() {
    document.querySelectorAll('.quick-input-widget').forEach(w => {
      if (watchedWidgets.has(w)) return;
      watchedWidgets.add(w);
      new MutationObserver(() => onWidgetChange(w)).observe(w, { attributes: true, attributeFilter: ['style', 'class'] });
      onWidgetChange(w);
    });
  }

  // Tras un click en un botón, buscar durante 2 s el widget que se abra (por si el observer llega tarde).
  function pollForWidget() {
    const until = Date.now() + 2000;
    const tick = () => {
      if (!anchor || Date.now() > until) return;
      watchQuickInput();
      document.querySelectorAll('.quick-input-widget').forEach(w => { if (isVisible(w)) onWidgetChange(w); });
      if (anchor) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function sync() {
    ensureStyle();
    const host = ensureHost('left');
    if (host) {
      for (const el of placeItems(host, LEFT_IDS)) {
        if (/\.ijt\.project$/.test(el.id)) decorateProject(el);
      }
      avoidTrafficLights(host);
    }
    const right = ensureHost('right');
    if (right) {
      for (const el of placeItems(right, RIGHT_IDS)) {
        if (/\.runConfigurations\.(device|selector)$/.test(el.id)) decorateDevice(el);
      }
    }
    const tw = ensureToolWindowsHost();
    if (tw) placeItems(tw, TOOL_WINDOWS.map(t => t.id));
    const pins = pinState();
    applyActivityHidden(pins);
    const more = ensureMoreHost();
    if (more) markDuplicatePins(placeItems(more, pins.items.map(k => 'ijt.pin.' + k).concat(MORE_TW.id)));
    const rs = ensureRightStripe();
    if (rs) placeItems(rs, RIGHT_ITEMS.map(r => r.id));
    placeInspections();
    renameTitles();
    watchQuickInput();
    // Estado activo de las ventanas de herramientas y de la franja derecha: también por eventos (ver start).
    refreshToolWindows();
    refreshRightStripe();
  }

  // ---- Tooltips de las columnas de ventanas. Se corta el "mouseover" para que VS Code no muestre el suyo
  // (lo coloca hacia arriba y, en la columna derecha, fuera de lugar) y se muestra uno al costado del ícono.
  let tipTimer = 0;
  function tipFor(item) {
    if (/\.ijt\.pin\./.test(item.id)) return item.getAttribute('aria-label') || '';
    const all = TOOL_WINDOWS.concat(RIGHT_ITEMS, [MORE_TW]);
    const def = all.find(x => item.id.endsWith('.' + x.id));
    return def && def.tip;
  }
  function hideTip() {
    clearTimeout(tipTimer);
    const t = document.getElementById('ijt-tooltip');
    if (t) t.classList.remove('show');
  }
  function showTip(item, side) {
    const text = tipFor(item);
    if (!text) return;
    let t = document.getElementById('ijt-tooltip');
    if (!t) { t = document.createElement('div'); t.id = 'ijt-tooltip'; document.body.appendChild(t); }
    const wb = document.querySelector('.monaco-workbench');
    if (wb) {
      const cs = getComputedStyle(wb);
      t.style.background = cs.getPropertyValue('--vscode-editorHoverWidget-background') || '#26282C';
      t.style.color = cs.getPropertyValue('--vscode-editorHoverWidget-foreground') || cs.getPropertyValue('--vscode-foreground') || '#D1D3D9';
      t.style.border = '1px solid ' + (cs.getPropertyValue('--vscode-editorHoverWidget-border') || '#33353B');
      t.style.fontFamily = cs.getPropertyValue('font-family');
    }
    t.textContent = text;
    const r = item.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    t.style.top = Math.round(r.top + r.height / 2 - tr.height / 2) + 'px';
    t.style.left = Math.round(side === 'left' ? r.left - tr.width - 8 : r.right + 8) + 'px';
    t.classList.add('show');
  }
  function wireTips(host, side) {
    if (host.dataset.ijtTips) return;
    host.dataset.ijtTips = '1';
    host.addEventListener('mouseover', e => {
      e.stopPropagation();
      const item = e.target.closest && e.target.closest('.statusbar-item');
      if (!item) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(item, side), 350);
    }, true);
    host.addEventListener('mouseout', e => {
      const to = e.relatedTarget;
      const item = e.target.closest && e.target.closest('.statusbar-item');
      if (item && to && item.contains(to)) return;
      hideTip();
    }, true);
    host.addEventListener('mousedown', hideTip, true);
  }

  function ensureToolWindowsHost() {
    const content = document.querySelector('.part.activitybar > .content');
    if (!content) return null;
    let host = content.querySelector(':scope > .ijt-toolwindows');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ijt-toolwindows';
      host.addEventListener('click', onToolWindowClick, true);
      wireTips(host, 'right');
    }
    // Justo después de los íconos de arriba (composite-bar): queda al pie, sobre Cuentas y Ajustes.
    const bar = content.querySelector(':scope > .composite-bar');
    const want = bar ? bar.nextSibling : content.firstChild;
    if (host.parentElement !== content || (bar && host.previousSibling !== bar)) content.insertBefore(host, want);
    return host;
  }

  // Contenedor del ⋮ dentro de la lista de íconos de arriba (composite-bar), tras su barra de acciones:
  // así queda pegado al último ícono visible. VS Code puede rehacer esa lista; sync() lo vuelve a poner.
  function ensureMoreHost() {
    const bar = document.querySelector('.part.activitybar > .content > .composite-bar');
    if (!bar) return null;
    let host = document.querySelector('.ijt-tw-more');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ijt-toolwindows ijt-tw-more';
      host.addEventListener('mousedown', anchorBeside, true);
      host.addEventListener('click', onPinClick, true);
      wireTips(host, 'right');
    }
    if (host.parentElement !== bar || host !== bar.lastElementChild) bar.appendChild(host);
    return host;
  }

  // Ventanas fijadas desde el ⋮ según su aria-label (lo escribe pins.js). natives: íconos de VS Code que se
  // vuelven a mostrar ({ key, label }); items: claves de los items "ijt.pin.<key>".
  let lastPinsLabel = null;
  let lastPins = { natives: [], items: [] };
  function pinState() {
    const more = findItem(MORE_TW.id);
    const s = (more && more.getAttribute('aria-label')) || '';
    if (s === lastPinsLabel) return lastPins;
    lastPinsLabel = s;
    const m = s.match(/\[ijt-pins:([^;\]]*);([^\]]*)\]/);
    const split = v => (v ? v.split('|').filter(Boolean) : []);
    lastPins = m ? {
      natives: split(m[1]).map(x => { const i = x.indexOf('='); return { key: x.slice(0, i), label: x.slice(i + 1) }; }),
      items: split(m[2])
    } : { natives: [], items: [] };
    return lastPins;
  }

  // Oculta los íconos de ACTIVITY_HIDDEN menos los fijados (solo reescribe el <style> si cambia).
  function applyActivityHidden(pins) {
    const shown = new Set(pins.natives.map(n => n.label));
    const hidden = ACTIVITY_HIDDEN.filter(l => !shown.has(l));
    const css = hidden.length ? `${hidden.map(activityItem).join(',\n')} { display: none !important; }` : '';
    let st = document.getElementById('ijt-activity-hidden');
    if (!st) { st = document.createElement('style'); st.id = 'ijt-activity-hidden'; document.head.appendChild(st); }
    if (st.textContent !== css) st.textContent = css;
  }

  // Un contenedor de extensión que ya tiene su ícono nativo visible en la columna no se repite.
  function markDuplicatePins(items) {
    for (const el of items) {
      if (!/\.ijt\.pin\./.test(el.id)) continue;
      const label = el.getAttribute('aria-label') || '';
      const nat = label && document.querySelector(`${activityItem(label.replace(/"/g, '\\"'))}`);
      const dup = !!(nat && nat.getClientRects().length);
      if (el.classList.contains('ijt-dup') !== dup) el.classList.toggle('ijt-dup', dup);
    }
  }

  // Ventana fijada ya abierta (panel o barra derecha): el click la cierra, como en IntelliJ.
  function onPinClick(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item || !item.classList.contains('ijt-active') || !currentBridge()) return;
    e.preventDefault();
    e.stopPropagation();
    sendBridgeOp(auxTitle().startsWith(item.getAttribute('aria-label') || '\u0000') ? 'closeAuxiliaryBar' : 'closePanel');
  }

  // Clic derecho sobre una fijada (item propio o ícono nativo vuelto a mostrar) → "Remove from Sidebar".
  function pinKeyAt(target) {
    const item = target.closest && target.closest('.ijt-tw-more .statusbar-item');
    if (item) {
      const m = item.id.match(/\.ijt\.pin\.(.+)$/);
      return m ? m[1] : null;
    }
    const act = target.closest && target.closest('.part.activitybar .composite-bar .action-item');
    const label = act && act.querySelector(':scope > .action-label');
    const aria = (label && label.getAttribute('aria-label')) || '';
    const n = pinState().natives.find(x => aria.startsWith(x.label));
    return n ? n.key : null;
  }
  function closeCtx() {
    const m = document.getElementById('ijt-ctx');
    if (m) m.remove();
  }
  function onPinContextMenu(e) {
    const key = pinKeyAt(e.target);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    hideTip();
    closeCtx();
    const menu = document.createElement('div');
    menu.id = 'ijt-ctx';
    const row = document.createElement('div');
    row.textContent = 'Remove from Sidebar';
    row.addEventListener('click', () => {
      closeCtx();
      callBridge('POST', '/action', { op: 'unpinToolWindow', key }).then(() => setTimeout(schedule, 100)).catch(() => {});
    });
    menu.appendChild(row);
    document.body.appendChild(menu);
    menu.style.left = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', ev => { if (!menu.contains(ev.target)) closeCtx(); }, { capture: true, once: true });
    });
  }

  // El menú del ⋮ se abre a la derecha del botón (como el popup de IntelliJ), no arriba al centro.
  function anchorBeside(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item) return;
    const r = item.getBoundingClientRect();
    const left = Math.round(r.right + 6);
    anchor = { left, right: left, alignRight: false, top: Math.round(r.top), at: Date.now() };
    pollForWidget();
  }

  // Pestaña activa del panel inferior, o null si el panel está cerrado.
  function activePanelTab() {
    const panel = document.querySelector('.part.panel');
    if (!panel || !panel.getClientRects().length || panel.getBoundingClientRect().height < 10) return null;
    const label = panel.querySelector(':scope > .title .composite-bar .action-item.checked .action-label');
    if (!label) return null;
    return (label.getAttribute('aria-label') || label.textContent || '').trim();
  }

  function refreshToolWindows() {
    const tab = activePanelTab();
    const aux = auxTitle();
    for (const el of document.querySelectorAll('.ijt-tw-more .statusbar-item[id*=".ijt.pin."]')) {
      const label = el.getAttribute('aria-label') || '';
      const on = !!label && ((!!tab && tab.startsWith(label)) || aux.startsWith(label));
      if (el.classList.contains('ijt-active') !== on) el.classList.toggle('ijt-active', on);
    }
    for (const t of TOOL_WINDOWS) {
      const el = findItem(t.id);
      if (!el || !el.closest('.ijt-toolwindows')) continue;
      const on = !!tab && t.tabs.some(name => tab.startsWith(name));
      if (el.classList.contains('ijt-active') !== on) el.classList.toggle('ijt-active', on);
    }
  }

  // Título del panel lateral derecho de VS Code (barra lateral secundaria), o '' si está cerrado.
  function auxTitle() {
    const aux = document.querySelector('.part.auxiliarybar');
    if (!aux || !aux.getClientRects().length || aux.getBoundingClientRect().width < 10) return '';
    const label = aux.querySelector('.composite-bar .action-item.checked .action-label') || aux.querySelector('.title-label h2');
    return label ? (label.getAttribute('aria-label') || label.textContent || '').trim() : '';
  }

  // VS Code calcula su diseño con window.innerWidth: se le informa RIGHT_STRIPE_W px menos (y se fuerza un
  // relayout) para que deje libre la franja de la derecha, en vez de taparle el borde del editor.
  let stripeReserved = false;
  function reserveRightStripe() {
    if (stripeReserved) return;
    const own = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const proto = Object.getOwnPropertyDescriptor(Window.prototype, 'innerWidth');
    const d = (own && own.get) ? own : proto;
    if (!d || !d.get) return;
    stripeReserved = true;
    Object.defineProperty(window, 'innerWidth', { configurable: true, get() { return d.get.call(window) - RIGHT_STRIPE_W; } });
    window.dispatchEvent(new Event('resize'));
  }

  function ensureRightStripe() {
    let el = document.getElementById('ijt-rightstripe');
    if (!el) {
      const any = RIGHT_ITEMS.some(r => findItem(r.id));
      if (!any) return null;
      el = document.createElement('div');
      el.id = 'ijt-rightstripe';
      el.innerHTML = '<div class="ijt-rs-top"></div><div class="ijt-toolwindows ijt-rs-items"></div><div class="ijt-rs-bottom"></div>';
      el.addEventListener('click', onRightStripeClick, true);
      wireTips(el, 'left');
      document.body.appendChild(el);
      reserveRightStripe();
    }
    return el.querySelector('.ijt-rs-items');
  }

  // Colores del tema (definidos en .monaco-workbench) y alto de barra de título / barra de estado.
  // Los colores solo se vuelven a copiar si el tema pudo cambiar (clase del workbench o <style> del
  // <head>) o, por si acaso, cada ~5 s: getComputedStyle + leer las variables cada 400 ms es caro.
  let themeDirty = true;
  function setHeight(node, px) {
    if (node && node.style.height !== px) node.style.height = px;
  }
  function refreshRightStripe() {
    const el = document.getElementById('ijt-rightstripe');
    if (!el) return;
    const wb = document.querySelector('.monaco-workbench');
    if (wb && themeDirty) {
      themeDirty = false;
      const cs = getComputedStyle(wb);
      for (const v of STRIPE_VARS) {
        const val = cs.getPropertyValue(v);
        if (el.style.getPropertyValue(v) !== val) el.style.setProperty(v, val);
      }
    }
    const tb = document.querySelector('.part.titlebar');
    const sb = document.querySelector('.part.statusbar');
    const top = tb ? Math.round(tb.getBoundingClientRect().bottom) : 0;
    const bottom = sb && sb.getClientRects().length ? Math.round(sb.getBoundingClientRect().height) : 0;
    setHeight(el.querySelector('.ijt-rs-top'), top + 'px');
    setHeight(el.querySelector('.ijt-rs-bottom'), bottom + 'px');
    for (const r of RIGHT_ITEMS) {
      const it = el.querySelector(`.statusbar-item[id$=".${r.id}"]`);
      if (!it) continue;
      const on = !!r.active();
      if (it.classList.contains('ijt-active') !== on) it.classList.toggle('ijt-active', on);
    }
  }

  function onRightStripeClick(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item || !item.classList.contains('ijt-active')) return;
    const r = RIGHT_ITEMS.find(x => item.id.endsWith('.' + x.id));
    if (!r || !r.close) return;
    sendBridgeOp(r.close());
    e.preventDefault();
    e.stopPropagation();
  }

  // Pide una acción al puente y, al terminar, refresca qué ventana de herramientas está activa.
  function sendBridgeOp(op) {
    callBridge('POST', '/action', { op })
      .then(() => setTimeout(() => { refreshToolWindows(); refreshRightStripe(); }, 150))
      .catch(() => {});
  }

  // "Explorer" → "Project" en el título de la barra lateral (y lo mismo en la auxiliar). VS Code reescribe
  // el título al cambiar de vista; esa mutación vuelve a llamar a sync() y se renombra otra vez.
  function renameTitles() {
    for (const h of document.querySelectorAll('.part.sidebar > .title .title-label h2, .part.auxiliarybar > .title .title-label h2')) {
      const t = h.textContent || '';
      for (const from in TITLE_RENAMES) {
        if (t === from || t.startsWith(from + ':')) { h.textContent = TITLE_RENAMES[from] + t.slice(from.length); break; }
      }
    }
  }

  // El widget de inspecciones va dentro del editor del grupo activo.
  function placeInspections() {
    const item = findItem('ijt.inspections');
    const container = document.querySelector('.part.editor .editor-group-container.active > .editor-container');
    if (!item || !container) return;
    let host = container.querySelector(':scope > .ijt-inspections-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ijt-inspections-host';
      container.appendChild(host);
    }
    if (item.parentElement !== host) host.appendChild(item);
  }

  // Click sobre la ventana ya abierta: cerrar el panel (como IntelliJ). Si no, el comando normal la abre.
  function onToolWindowClick(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item || !item.classList.contains('ijt-active')) return;
    if (!currentBridge()) return; // sin puente: que el comando normal haga lo suyo
    e.preventDefault();
    e.stopPropagation();
    sendBridgeOp('closePanel');
  }

  // Deja libre el espacio de los semáforos de macOS (cerrar / minimizar / maximizar).
  const TRAFFIC_LIGHTS_END = 78; // px desde el borde izquierdo de la ventana
  const GAP = 6;
  function avoidTrafficLights(host) {
    const wb = document.querySelector('.monaco-workbench');
    const isMac = wb && wb.classList.contains('mac');
    const fullscreen = wb && wb.classList.contains('fullscreen');
    let minLeft = GAP;
    if (isMac && !fullscreen) {
      const controls = document.querySelector('.part.titlebar .window-controls-container');
      const r = controls && controls.offsetParent !== null ? controls.getBoundingClientRect() : null;
      minLeft = Math.max(TRAFFIC_LIGHTS_END, r && r.width ? r.right + GAP : 0);
    }
    const current = parseFloat(host.style.marginLeft) || 0;
    const left = host.getBoundingClientRect().left - current;
    const needed = Math.max(0, Math.round(minLeft - left));
    if (needed !== current) host.style.marginLeft = needed + 'px';
  }

  // =====================================================================
  // Menú de ramas estilo IntelliJ (árbol plegable + submenú a un lado).
  // Habla con la extensión (bridge.js) por HTTP local; el puerto y el token
  // vienen en el aria-label del botón de rama: "[ijt:<puerto>:<token>]".
  // =====================================================================

  const popupCss = `
    .ijt-pop, .ijt-sub {
      position: fixed; z-index: 2600; -webkit-app-region: no-drag;
      background: var(--vscode-menu-background, var(--vscode-quickInput-background));
      color: var(--vscode-menu-foreground, var(--vscode-quickInput-foreground));
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, rgba(128,128,128,.35)));
      border-radius: 8px; box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0,0,0,.45));
      font-size: 13px; user-select: none; outline: none;
    }
    .ijt-pop { width: 400px; display: flex; flex-direction: column; overflow: hidden; }
    .ijt-pop-head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 6px; }
    .ijt-pop-head input {
      flex: 1; height: 26px; box-sizing: border-box; padding: 0 8px 0 26px; border-radius: 5px; outline: none;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent); font: inherit;
    }
    .ijt-pop-head input:focus { border-color: var(--vscode-focusBorder); }
    .ijt-pop-head .ijt-search-ico { position: absolute; margin-left: 8px; opacity: .6; pointer-events: none; }
    .ijt-ibtn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; cursor: pointer; opacity: .85; }
    .ijt-ibtn:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
    .ijt-ibtn.spin .codicon { animation: codicon-spin 1.2s linear infinite; }
    .ijt-list { overflow-y: auto; padding: 2px 4px 6px; }
    .ijt-row {
      display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 6px; border-radius: 4px;
      white-space: nowrap; cursor: default;
    }
    .ijt-row.active { background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground)); color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground)); }
    .ijt-row .codicon { font-size: 14px; flex-shrink: 0; }
    .ijt-row .ijt-tw { width: 14px; opacity: .8; }
    .ijt-row .ijt-label { overflow: hidden; text-overflow: ellipsis; }
    .ijt-row .ijt-sp { flex: 1; }
    .ijt-row .ijt-desc { opacity: .6; font-size: 12px; }
    .ijt-row .ijt-sync { font-size: 12px; display: inline-flex; align-items: center; gap: 1px; }
    .ijt-row .ijt-sync.behind { color: #e8954a; }
    .ijt-row .ijt-sync.ahead { color: #5fb865; }
    .ijt-row .ijt-sync .codicon { font-size: 12px; }
    .ijt-row .ijt-more { opacity: .6; font-size: 12px; }
    .ijt-row.group { font-weight: 600; margin-top: 2px; }
    .ijt-sep { height: 1px; margin: 4px 6px; background: var(--vscode-menu-separatorBackground, rgba(128,128,128,.3)); }
    .ijt-empty { padding: 10px 12px; opacity: .7; }
    .ijt-c-update { color: #4c9cf0; } .ijt-c-commit, .ijt-c-push { color: #5fb865; }
    .ijt-c-add { color: #5fb865; } .ijt-c-star { color: #e5c07b; } .ijt-c-branch { color: #6ea6f7; }
    .ijt-c-current { color: #5fb865; } .ijt-c-danger { color: #e06c75; }
    .ijt-sub { min-width: 260px; max-width: 560px; padding: 4px; }
    .ijt-sub .ijt-row { height: 24px; padding: 0 10px; }
  `;

  const POP = {
    el: null, list: null, input: null, sub: null, info: null, data: null, rows: [], active: -1,
    subRows: [], subActive: -1, focus: 'main', subFor: -1, hoverTimer: 0, filter: ''
  };

  let toggled;
  try { toggled = new Set(JSON.parse(localStorage.getItem('ijt.toggled') || '[]')); } catch { toggled = new Set(); }
  function saveToggled() { try { localStorage.setItem('ijt.toggled', JSON.stringify([...toggled])); } catch { /* sin storage */ } }
  function isOpen(key, def) { return toggled.has(key) ? !def : def; }
  function toggleKey(key) { toggled.has(key) ? toggled.delete(key) : toggled.add(key); saveToggled(); }

  function bridgeInfo(item) {
    const s = (item && item.getAttribute('aria-label')) || '';
    const m = s.match(/\[ijt:(\d+):([0-9a-f]+)\]/);
    return m ? { port: m[1], token: m[2] } : null;
  }

  function currentBridge() { return bridgeInfo(findItem('ijt.branchMenu')); }

  // Única llamada HTTP al puente (bridge.js). El puerto y el token se leen del botón de rama en cada
  // llamada (cambian si se reinicia el host de extensiones); POP.info solo como respaldo.
  async function callBridge(method, path, body) {
    const info = currentBridge() || POP.info;
    if (!info) throw new Error('Sin conexión con la extensión');
    const r = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method, headers: { 'x-ijt-token': info.token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  }

  function onHostClick(e) {
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (!item || !/\.ijt\.branchMenu$/.test(item.id)) return;
    const info = bridgeInfo(item);
    if (!info) return; // sin puente: que VS Code abra el quick pick de siempre
    e.preventDefault();
    e.stopPropagation();
    anchor = null;
    if (POP.el) { closePopup(); return; }
    openPopup(item, info);
  }

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function icon(name, extra) { return h('span', `codicon codicon-${name}${extra ? ' ' + extra : ''}`); }

  async function openPopup(item, info) {
    const wb = document.querySelector('.monaco-workbench') || document.body;
    if (!document.getElementById('ijt-popup-style')) {
      const s = h('style'); s.id = 'ijt-popup-style'; s.textContent = popupCss; document.head.appendChild(s);
    }
    POP.info = info;
    POP.filter = '';
    const el = h('div', 'ijt-pop'); el.tabIndex = -1;
    const head = h('div', 'ijt-pop-head');
    const searchWrap = h('div'); searchWrap.style.cssText = 'flex:1;display:flex;align-items:center;position:relative';
    const ico = icon('search', 'ijt-search-ico');
    const input = h('input'); input.placeholder = 'Search for branches and actions'; input.spellcheck = false;
    searchWrap.append(ico, input);
    const fetchBtn = h('span', 'ijt-ibtn'); fetchBtn.title = 'Fetch'; fetchBtn.append(icon('refresh'));
    head.append(searchWrap, fetchBtn);
    const list = h('div', 'ijt-list');
    el.append(head, list);
    wb.appendChild(el);
    Object.assign(POP, { el, list, input });

    const r = pageRect(item);
    const top = Math.round(r.bottom + 4);
    el.style.top = top + 'px';
    el.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - 408)) + 'px';
    list.style.maxHeight = Math.max(200, window.innerHeight - top - 70) + 'px';

    input.addEventListener('input', () => { POP.filter = input.value.trim().toLowerCase(); closeSub(); render(true); });
    el.addEventListener('keydown', onKey, true);
    fetchBtn.addEventListener('click', async () => {
      fetchBtn.classList.add('spin');
      try { await callBridge('POST', '/action', { op: 'fetch', wait: true }); await load(); }
      catch (err) { showError(err); }
      fetchBtn.classList.remove('spin');
    });
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('blur', closePopup);
    window.addEventListener('resize', closePopup);
    input.focus();

    list.append(h('div', 'ijt-empty', 'Cargando…'));
    try { await load(); } catch (err) { showError(err); }
  }

  async function load() {
    POP.data = await callBridge('GET', '/branches');
    if (POP.el) render(true);
  }

  function showError(err) {
    if (!POP.list) return;
    POP.list.textContent = '';
    POP.list.append(h('div', 'ijt-empty', 'No se pudo hablar con la extensión: ' + (err && err.message ? err.message : err)));
  }

  function closePopup() {
    if (!POP.el) return;
    closeSub();
    POP.el.remove();
    POP.el = POP.list = POP.input = null;
    POP.rows = []; POP.active = -1; POP.focus = 'main';
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('blur', closePopup);
    window.removeEventListener('resize', closePopup);
  }

  function onOutside(e) {
    if (POP.el && POP.el.contains(e.target)) return;
    if (POP.sub && POP.sub.contains(e.target)) return;
    const item = e.target.closest && e.target.closest('.statusbar-item');
    if (item && /\.ijt\.branchMenu$/.test(item.id)) return; // el click del botón lo cierra (toggle)
    closePopup();
  }

  // ---------------------------------------------------------- modelo de filas

  const MAIN = new Set(['main', 'master']);
  const TOP_ACTIONS = [
    { op: 'update', label: 'Update Project…', icon: 'arrow-down', cls: 'ijt-c-update' },
    { op: 'commit', label: 'Commit…', icon: 'check', cls: 'ijt-c-commit' },
    { op: 'push', label: 'Push…', icon: 'arrow-up', cls: 'ijt-c-push' },
    { sep: true },
    { op: 'newBranch', label: 'New Branch…', icon: 'add', cls: 'ijt-c-add' },
    { op: 'newWorktree', label: 'New Worktree…', icon: 'list-tree' },
    { op: 'checkoutTag', label: 'Checkout Tag or Revision…', icon: 'tag' }
  ];

  function leafCmp(a, b) {
    return (MAIN.has(b.leaf) - MAIN.has(a.leaf)) || a.leaf.localeCompare(b.leaf);
  }

  function buildTree(entries) {
    const root = { folders: new Map(), leaves: [] };
    for (const e of entries) {
      const parts = e.path.split('/');
      let n = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!n.folders.has(parts[i])) n.folders.set(parts[i], { name: parts[i], folders: new Map(), leaves: [] });
        n = n.folders.get(parts[i]);
      }
      n.leaves.push(Object.assign({}, e, { leaf: parts[parts.length - 1] }));
    }
    return root;
  }

  function emitTree(rows, node, group, prefix, depth, sorted, defOpen) {
    let folders = [...node.folders.values()];
    if (sorted) folders.sort((a, b) => a.name.localeCompare(b.name));
    const leaves = sorted ? node.leaves.slice().sort(leafCmp) : node.leaves;
    // main/master primero, luego carpetas, luego el resto (como IntelliJ)
    const fav = leaves.filter(l => MAIN.has(l.leaf));
    const rest = leaves.filter(l => !MAIN.has(l.leaf));
    for (const l of fav) rows.push(Object.assign({ type: 'branch', depth }, l));
    for (const f of folders) {
      const key = `${group}:${prefix}${f.name}`;
      const open = isOpen(key, defOpen(depth));
      rows.push({ type: 'folder', key, label: f.name, depth, open });
      if (open) emitTree(rows, f, group, prefix + f.name + '/', depth + 1, sorted, defOpen);
    }
    for (const l of rest) rows.push(Object.assign({ type: 'branch', depth }, l));
  }

  function localEntry(d, b, group) {
    return { path: b.name, ref: b.name, remote: false, current: b.name === d.head, upstream: b.upstream, ahead: b.ahead, behind: b.behind, group };
  }

  function buildRows() {
    const d = POP.data;
    const rows = [];
    const f = POP.filter;
    const match = s => !f || s.toLowerCase().includes(f);

    const acts = TOP_ACTIONS.filter(a => a.sep ? !f : match(a.label));
    for (const a of acts) rows.push(a.sep ? { type: 'sep' } : Object.assign({ type: 'action' }, a));
    if (!d) return rows;
    if (acts.length) rows.push({ type: 'sep' });

    const byName = new Map(d.local.map(b => [b.name, b]));
    const groups = [
      { id: 'recent', label: 'Recent', sorted: false, entries: d.recent.filter(n => byName.has(n)).map(n => localEntry(d, byName.get(n), 'recent')), defOpen: () => true },
      { id: 'local', label: 'Local', sorted: true, entries: d.local.map(b => localEntry(d, b, 'local')), defOpen: () => false },
      { id: 'remote', label: 'Remote', sorted: true, entries: d.remote.map(n => ({ path: n, ref: n, remote: true, current: false, group: 'remote' })), defOpen: depth => depth === 1 }
    ];

    for (const g of groups) {
      if (f) {
        if (g.id === 'recent') continue;
        const hits = g.entries.filter(e => match(e.path));
        if (!hits.length) continue;
        rows.push({ type: 'group', key: 'g:' + g.id, label: g.label, open: true, fixed: true, depth: 0 });
        for (const e of hits) rows.push(Object.assign({ type: 'branch', depth: 1, leaf: e.path }, e));
        continue;
      }
      if (!g.entries.length) continue;
      const open = isOpen('g:' + g.id, true);
      rows.push({ type: 'group', key: 'g:' + g.id, label: g.label, open, depth: 0 });
      if (open) emitTree(rows, buildTree(g.entries), g.id, '', 1, g.sorted, g.defOpen);
    }
    if (f && !rows.some(r => r.type !== 'sep')) rows.push({ type: 'empty' });
    return rows;
  }

  function selectable(r) { return r && (r.type === 'action' || r.type === 'group' || r.type === 'folder' || r.type === 'branch'); }

  function render(resetActive) {
    if (!POP.list) return;
    const prevKey = !resetActive && POP.rows[POP.active] ? rowKey(POP.rows[POP.active]) : null;
    POP.rows = buildRows();
    POP.list.textContent = '';
    POP.rows.forEach((r, i) => { r.el = renderRow(r, i); POP.list.append(r.el); });
    let idx = prevKey ? POP.rows.findIndex(r => rowKey(r) === prevKey) : -1;
    if (idx < 0) idx = POP.filter ? POP.rows.findIndex(r => r.type === 'branch') : -1;
    if (idx < 0) idx = POP.rows.findIndex(selectable);
    setActive(idx, false);
  }

  function rowKey(r) { return r.type === 'branch' ? `b:${r.group}:${r.ref}` : (r.key || r.op || ''); }

  function renderRow(r, i) {
    if (r.type === 'sep') return h('div', 'ijt-sep');
    if (r.type === 'empty') return h('div', 'ijt-empty', 'Sin resultados');
    const el = h('div', 'ijt-row' + (r.type === 'group' ? ' group' : ''));
    el.style.paddingLeft = (6 + (r.depth || 0) * 16) + 'px';
    if (r.type === 'action') {
      el.append(icon(r.icon, r.cls), h('span', 'ijt-label', r.label));
    } else if (r.type === 'group' || r.type === 'folder') {
      el.append(icon(r.fixed ? 'blank' : (r.open ? 'chevron-down' : 'chevron-right'), 'ijt-tw'));
      if (r.type === 'folder') el.append(icon(r.open ? 'folder-opened' : 'folder'));
      el.append(h('span', 'ijt-label', r.label));
    } else if (r.type === 'branch') {
      const ic = r.current ? icon('tag', 'ijt-c-current') : MAIN.has(r.leaf) || MAIN.has(r.ref.split('/').pop())
        ? icon('star-full', 'ijt-c-star') : icon('git-branch', 'ijt-c-branch');
      el.append(ic, h('span', 'ijt-label', r.leaf), h('span', 'ijt-sp'));
      if (r.behind) { const s = h('span', 'ijt-sync behind'); s.append(icon('arrow-down'), document.createTextNode(String(r.behind))); el.append(s); }
      if (r.ahead) { const s = h('span', 'ijt-sync ahead'); s.append(icon('arrow-up'), document.createTextNode(String(r.ahead))); el.append(s); }
      if (r.upstream) el.append(h('span', 'ijt-desc', r.upstream));
      el.append(icon('chevron-right', 'ijt-more'));
      el.title = r.ref;
    }
    el.addEventListener('mousemove', () => { if (POP.active !== i) setActive(i, false, true); });
    el.addEventListener('click', () => activate(i, true));
    return el;
  }

  function setActive(i, scroll, fromHover) {
    if (POP.rows[POP.active] && POP.rows[POP.active].el) POP.rows[POP.active].el.classList.remove('active');
    POP.active = i;
    const r = POP.rows[i];
    if (!r || !r.el) return;
    r.el.classList.add('active');
    if (scroll !== false) r.el.scrollIntoView({ block: 'nearest' });
    clearTimeout(POP.hoverTimer);
    if (fromHover) {
      // Al pasar el mouse por una rama se abre su submenú (con un pequeño retardo para poder cruzar filas).
      POP.hoverTimer = setTimeout(() => {
        if (POP.active !== i) return;
        if (r.type === 'branch') openSub(i, false); else closeSub();
      }, r.type === 'branch' ? 180 : 250);
    }
  }

  function move(delta) {
    let i = POP.active;
    for (let n = 0; n < POP.rows.length; n++) {
      i = (i + delta + POP.rows.length) % POP.rows.length;
      if (selectable(POP.rows[i])) { setActive(i); return; }
    }
  }

  function activate(i, fromMouse) {
    const r = POP.rows[i];
    if (!r) return;
    if (r.type === 'action') return run({ op: r.op });
    if ((r.type === 'group' && !r.fixed) || r.type === 'folder') { toggleKey(r.key); closeSub(); render(false); return; }
    if (r.type === 'branch') openSub(i, !fromMouse);
  }

  function run(body) {
    closePopup();
    // Los diálogos que abra la acción (nombre de rama, worktree…) salen bajo el botón de rama.
    anchorTo('ijt.branchMenu', 1500);
    callBridge('POST', '/action', body).catch(err => console.error('[ijt]', err));
  }

  // ---------------------------------------------------------- submenú

  function branchActions(r) {
    const head = POP.data && POP.data.head;
    const q = s => `'${s}'`;
    const base = { ref: r.ref, remote: r.remote };
    const A = (label, op, ico, cls) => Object.assign({ label, op, icon: ico, cls }, base);
    if (r.current) {
      return [
        A(`New Branch from ${q(r.ref)}…`, 'newBranch', 'add', 'ijt-c-add'),
        A('Update', 'update', 'arrow-down', 'ijt-c-update'),
        A('Push…', 'push', 'arrow-up', 'ijt-c-push'),
        { sep: true },
        A('Rename…', 'rename', 'edit')
      ];
    }
    const items = [
      A('Checkout', 'checkout', 'check'),
      A(`New Branch from ${q(r.ref)}…`, 'newBranch', 'add', 'ijt-c-add')
    ];
    if (head) {
      items.push(A(`Checkout and Rebase onto ${q(head)}`, 'checkoutRebase', 'git-pull-request'));
      items.push({ sep: true });
      items.push(A(`Compare with ${q(head)}`, 'compare', 'git-compare'));
    } else {
      items.push({ sep: true });
    }
    items.push(A('Show Diff with Working Tree', 'diffWorking', 'diff'));
    if (head) {
      items.push({ sep: true });
      items.push(A(`Rebase ${q(head)} onto ${q(r.ref)}`, 'rebaseOnto', 'git-commit'));
      items.push(A(`Merge ${q(r.ref)} into ${q(head)}`, 'merge', 'git-merge'));
    }
    items.push({ sep: true });
    items.push(A(`New Worktree from ${q(r.ref)}…`, 'worktreeFrom', 'list-tree'));
    if (r.remote && head) {
      items.push({ sep: true });
      items.push(A(`Pull into ${q(head)} Using Rebase`, 'pullRebase', 'arrow-down', 'ijt-c-update'));
      items.push(A(`Pull into ${q(head)} Using Merge`, 'pullMerge', 'arrow-down', 'ijt-c-update'));
    }
    items.push({ sep: true });
    items.push(A('Delete', 'delete', 'trash', 'ijt-c-danger'));
    return items;
  }

  function openSub(i, focusIt) {
    const r = POP.rows[i];
    if (!r || r.type !== 'branch' || !POP.el) return;
    if (POP.sub && POP.subFor === i) { if (focusIt) focusSub(0); return; }
    closeSub();
    const sub = h('div', 'ijt-sub');
    const items = branchActions(r);
    POP.subRows = [];
    items.forEach(it => {
      if (it.sep) { sub.append(h('div', 'ijt-sep')); return; }
      const idx = POP.subRows.length;
      const row = h('div', 'ijt-row');
      row.append(icon(it.icon || 'blank', it.cls), h('span', 'ijt-label', it.label));
      row.addEventListener('mousemove', () => { clearTimeout(POP.hoverTimer); setSubActive(idx); });
      row.addEventListener('click', () => run({ op: it.op, ref: it.ref, remote: it.remote }));
      it.el = row;
      POP.subRows.push(it);
      sub.append(row);
    });
    sub.addEventListener('mouseenter', () => clearTimeout(POP.hoverTimer));
    (document.querySelector('.monaco-workbench') || document.body).appendChild(sub);
    POP.sub = sub; POP.subFor = i; POP.subActive = -1;

    const rr = r.el.getBoundingClientRect();
    const pr = POP.el.getBoundingClientRect();
    const sr = sub.getBoundingClientRect();
    let left = pr.right - 2;
    if (left + sr.width > window.innerWidth - 8) left = Math.max(8, pr.left - sr.width + 2);
    let top = rr.top - 4;
    if (top + sr.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - sr.height);
    sub.style.left = left + 'px';
    sub.style.top = top + 'px';
    if (focusIt) focusSub(0);
  }

  function focusSub(i) { POP.focus = 'sub'; setSubActive(i); }

  function setSubActive(i) {
    const prev = POP.subRows[POP.subActive];
    if (prev) prev.el.classList.remove('active');
    POP.subActive = i;
    const cur = POP.subRows[i];
    if (cur) cur.el.classList.add('active');
  }

  function closeSub() {
    if (POP.sub) POP.sub.remove();
    POP.sub = null; POP.subFor = -1; POP.subRows = []; POP.subActive = -1; POP.focus = 'main';
  }

  // ---------------------------------------------------------- teclado

  function onKey(e) {
    const k = e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') {
      stop();
      if (POP.focus === 'sub') closeSub(); else closePopup();
      return;
    }
    if (POP.focus === 'sub') {
      if (k === 'ArrowDown') { stop(); setSubActive((POP.subActive + 1) % POP.subRows.length); }
      else if (k === 'ArrowUp') { stop(); setSubActive((POP.subActive - 1 + POP.subRows.length) % POP.subRows.length); }
      else if (k === 'ArrowLeft') { stop(); closeSub(); }
      else if (k === 'Enter') { stop(); const it = POP.subRows[POP.subActive]; if (it) run({ op: it.op, ref: it.ref, remote: it.remote }); }
      else { e.stopPropagation(); }
      return;
    }
    const r = POP.rows[POP.active];
    if (k === 'ArrowDown') { stop(); closeSub(); move(1); }
    else if (k === 'ArrowUp') { stop(); closeSub(); move(-1); }
    else if (k === 'Enter') { stop(); activate(POP.active, false); }
    else if (k === 'ArrowRight' && r && (r.type === 'branch' || ((r.type === 'folder' || r.type === 'group') && !r.open))) {
      stop();
      if (r.type === 'branch') openSub(POP.active, true); else activate(POP.active, false);
    }
    else if (k === 'ArrowLeft' && r && (r.type === 'folder' || r.type === 'group') && r.open && !r.fixed && !POP.input.value) {
      stop(); activate(POP.active, false);
    }
    else { e.stopPropagation(); } // que VS Code no capture las teclas mientras se escribe
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; try { sync(); } catch (e) { console.error('[ijt]', e); } });
  }

  // Los cambios dentro del editor (Monaco redibuja líneas al escribir), la terminal, las filas de las listas
  // y árboles (explorador, SCM… se re-renderizan al hacer scroll), las barras de scroll (cambian de clase al
  // aparecer/desvanecerse), los hovers, la lista del quick pick y nuestro propio menú de ramas no mueven nada
  // de lo nuestro: si todas las mutaciones vienen de ahí, no se re-sincroniza.
  const NOISY = '.monaco-editor, .xterm, .monaco-list-rows, .scrollbar, .monaco-hover, .quick-input-list, .ijt-pop, .ijt-sub, #ijt-tooltip, #ijt-ctx';
  function onBodyMutations(records) {
    for (const r of records) {
      const t = r.target;
      if (!(t.closest && t.closest(NOISY))) { schedule(); return; }
    }
  }

  function start() {
    // childList: aparecen/desaparecen items y partes. class: se abre/cierra el panel o la barra lateral
    // (clases nopanel/noauxiliarybar del workbench), cambia la pestaña activa (checked), el grupo de
    // editores activo (active) o el centro de notificaciones (visible). Así no hace falta sondear.
    new MutationObserver(onBodyMutations).observe(document.body,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    document.addEventListener('contextmenu', onPinContextMenu, true);
    window.addEventListener('blur', closeCtx);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtx(); }, true);
    // Cambio de tema: VS Code reescribe su <style> de colores en el <head>.
    new MutationObserver(() => { themeDirty = true; })
      .observe(document.head, { childList: true, subtree: true, characterData: true });
    // Entrar / salir de pantalla completa (y cambiar de tema) cambia la clase del workbench.
    const watchWorkbench = () => {
      const wb = document.querySelector('.monaco-workbench');
      if (!wb) return setTimeout(watchWorkbench, 500);
      new MutationObserver(() => { themeDirty = true; }).observe(wb, { attributes: true, attributeFilter: ['class'] });
    };
    watchWorkbench();
    // Respaldo por si algún cambio no deja rastro en el DOM observado (p. ej. colores de
    // workbench.colorCustomizations): cada 2 s, y los colores del tema cada ~6 s.
    let tick = 0;
    setInterval(() => {
      if (document.hidden) return; // ventana minimizada u oculta: nada que refrescar
      if (++tick >= 3) { tick = 0; themeDirty = true; }
      schedule();
    }, 2000);
    // Al volver a la ventana, refrescar enseguida en vez de esperar al siguiente tick.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { themeDirty = true; schedule(); } });
    schedule();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
