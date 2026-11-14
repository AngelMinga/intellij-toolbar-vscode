# IntelliJ Toolbar para VS Code

Barra superior de VS Code al estilo IntelliJ IDEA (macOS):

- **Izquierda:** proyecto (`FA fintech_app ⌄`, proyectos recientes) y rama (`⎇ rama ⌄`), con un menú de ramas propio: carpetas plegables en *Recent / Local / Remote* y un submenú a un lado por rama (Checkout, New Branch from, Rebase, Merge, Compare, Pull, Delete…).
- **Derecha:** device, configuración, Run, Debug y Stop (de la extensión [run-configurations](https://github.com/AngelMinga/run-config)), más Hot Reload, Hot Restart, `⋮` (DevTools, Get Packages, Clean…) una lupa 🔍 que abre el buscador de VS Code (Go to File, comandos, texto…) y un ⚙ con Settings, Keymap, Plugins y Theme. El buscador del centro de la barra se oculta.
- **Abajo a la izquierda:** columna de ventanas de herramientas (Run, Terminal, Output, Problems, TODO, Git) al pie de la barra de actividad; la abierta queda resaltada y un clic sobre ella cierra el panel.
- **Derecha (columna):** Notifications, Running Devices (PhonePane), Flutter Inspector y AI (Claude Code), en una franja vertical como la de IntelliJ.
- **Editor:** indicador de problemas del archivo arriba a la derecha (errores, warnings o ✓); clic → Problems.
- **Tema "Islands Dark (IntelliJ)":** colores del editor y de la interfaz extraídos de IntelliJ IDEA (esquema Islands Dark), con resaltado semántico para Dart.
- **Tema "Islands Dark (código VS Code)":** la misma interfaz de Islands, con los colores de código por defecto de VS Code (se genera con `themes/build_vscode_code_variant.py`).
- Los menús se abren **debajo del botón** pulsado, también con `window.zoomLevel` distinto de 0.

## Cómo funciona

La API de extensiones de VS Code no permite poner botones en la barra de título, así que hay dos piezas:

| Pieza | Qué hace |
|---|---|
| Extensión (`extension.js`, `menus.js`, `toolbar.js`, `bridge.js`) | Crea los botones (como items de la barra de estado), los menús y un puente HTTP local (`127.0.0.1`, puerto aleatorio y token) para el menú de ramas. |
| `titlebar-inject.js` + [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) | Mueve esos botones a la barra de título, dibuja el menú de ramas y coloca los menús bajo su botón. |

Sin la inyección todo funciona igual, pero con los botones en la barra inferior.

## Instalación

```bash
npx @vscode/vsce package          # genera intellij-toolbar-<versión>.vsix
./setup/setup.sh                  # instalación completa (o --basico, --settings, --desinstalar)
```

Luego en VS Code: `Cmd+Shift+P` → **Enable Custom CSS and JS** y reiniciar con `Cmd+Q`. Tras cada actualización de VS Code hay que repetir ese paso.

Guía completa, opciones del script y problemas frecuentes: [setup/SETUP.md](setup/SETUP.md).
