# Barra estilo IntelliJ para VS Code

Pone en la barra superior de VS Code, junto a los semáforos de macOS, los botones de **proyecto** (`FA fintech_app ⌄`) y **rama** (`⎇ feature/… ⌄`), con menús parecidos a los de IntelliJ:

- **Proyecto**: New Window, Open…, Clone Repository…, proyectos abiertos y recientes.
- **Rama**: búsqueda, Update / Commit / Push, New Branch, New Worktree, Checkout Tag; ramas agrupadas en **Recent**, **Local** y **Remote**, y un submenú por rama (Checkout, New Branch from, Merge, Compare, Delete).

## Por qué hace falta un "hack"

La API de extensiones de VS Code **no permite poner botones en la parte izquierda de la barra de título**. Por eso la instalación tiene dos partes:

| Parte | Qué hace | ¿Oficial? |
|---|---|---|
| Extensión `intellij-toolbar-*.vsix` | Crea los menús y los botones (en la barra inferior) | Sí |
| `titlebar-inject.js` + **Custom CSS and JS Loader** | Mueve esos botones a la barra superior | No: modifica archivos internos de VS Code |

Si solo instalas la primera parte, todo funciona igual, pero los botones quedan en la barra inferior izquierda.

### Menú de ramas con submenú a un lado

Con la instalación completa, el botón de rama abre un menú propio (no el buscador de VS Code):

- Carpetas plegables (`feature/…`) en **Recent**, **Local** y **Remote**; lo que pliegas se recuerda.
- Al pasar el mouse por una rama, o con **→**, se abre a un lado su submenú: Checkout, New Branch from, Checkout and Rebase, Compare, Show Diff with Working Tree, Rebase, Merge, New Worktree from, Pull (rebase / merge) y Delete.
- Teclado: **↑ ↓** moverse · **→ ←** abrir o cerrar · **Enter** ejecutar · **Esc** cerrar. Escribir filtra.
- Botón ⟳ = `git fetch` y recarga.

El menú se comunica con la extensión mediante `bridge.js`: un servidor HTTP que solo escucha en `127.0.0.1`, con puerto aleatorio y un token nuevo en cada arranque. Si el puente no está disponible, el botón vuelve a abrir el buscador de VS Code de siempre.

## Contenido de la carpeta

```
intellij-toolbar-vscode/
├── extension.js, menus.js, package.json   # código de la extensión
├── toolbar.js                             # botones extra: Hot Reload, Hot Restart, ⋮ (Run/Debug los pone run-configurations)
├── bridge.js                              # servidor local (127.0.0.1 + token) para el menú de ramas
├── intellij-toolbar-0.11.0.vsix            # extensión empaquetada
├── titlebar-inject.js                     # mueve los botones arriba y dibuja el menú de ramas estilo IntelliJ
└── setup/
    ├── setup.sh                           # instalador
    └── SETUP.md                           # esta guía
```

## Requisitos

- macOS con VS Code.
- Extensión **run-configurations** (`plugins-intellij/run-config`, 0.3.2 o superior): aporta en la barra superior el device, el selector de configuración, Run, Debug y Stop. Sin ella solo aparecen Hot Reload, Hot Restart y ⋮.
- Comando `code` en el PATH (en VS Code: `Cmd+Shift+P` → **Shell Command: Install 'code' command in PATH**).
- `python3` (viene con las Command Line Tools de Xcode).

## Opciones del script

| Comando | Qué hace |
|---|---|
| `./setup.sh` | **Instalación completa**: extensión + loader + settings. Luego faltan los pasos manuales. |
| `./setup.sh --basico` | Solo la extensión y los settings. Botones en la barra inferior, sin modificar VS Code. |
| `./setup.sh --settings` | Solo vuelve a aplicar los settings (por ejemplo, si los borraste). |
| `./setup.sh --desinstalar` | Quita el loader, la extensión y la entrada `vscode_custom_css.imports`. |
| `./setup.sh --ayuda` | Muestra la ayuda. |

Antes de tocar `settings.json`, el script guarda una copia con fecha (`settings.json.bak-AAAAMMDD-HHMMSS`, en la misma carpeta). Puedes ejecutarlo varias veces sin duplicar nada.

Settings que aplica:

```jsonc
"window.titleBarStyle": "custom",
"workbench.editor.editorActionsLocation": "titleBar",
"window.commandCenter": true,
"window.title": "${rootName}   ⎇ ${activeRepositoryBranchName}",
"debug.showInStatusBar": "never",
"git-graph.showStatusBarItem": false,
"vscode_custom_css.imports": ["file:///…/intellij-toolbar-vscode/titlebar-inject.js"]  // solo en la instalación completa
```

## Formas de ejecutarlo

**1. Desde la Terminal de macOS o la terminal integrada de VS Code (`` Ctrl+` ``)**

```bash
cd ~/IdeaProjects/plugins-intellij/intellij-toolbar-vscode/setup
./setup.sh
```

**2. Sin entrar a la carpeta**

```bash
~/IdeaProjects/plugins-intellij/intellij-toolbar-vscode/setup/setup.sh --basico
```

**3. Con `bash`** (si el archivo perdió el permiso de ejecución, por ejemplo al copiarlo o clonarlo)

```bash
bash ~/IdeaProjects/plugins-intellij/intellij-toolbar-vscode/setup/setup.sh
# o devolverle el permiso:
chmod +x ~/IdeaProjects/plugins-intellij/intellij-toolbar-vscode/setup/setup.sh
```

**4. Como alias** (agregar a `~/.zshrc` y abrir una terminal nueva)

```bash
alias ij-toolbar="~/IdeaProjects/plugins-intellij/intellij-toolbar-vscode/setup/setup.sh"
# uso: ij-toolbar  |  ij-toolbar --basico  |  ij-toolbar --desinstalar
```

**5. Desde VS Code**: clic derecho sobre `setup.sh` en el explorador → **Open in Integrated Terminal**, y ejecuta `./setup.sh`.

## Pasos manuales (solo en la instalación completa)

VS Code no permite automatizarlos:

1. `Cmd+Shift+P` → **Enable Custom CSS and JS**.
2. Cierra VS Code por completo con **`Cmd+Q`** y vuelve a abrirlo. *Developer: Reload Window* no basta.
3. Si aparece **"Your Code installation appears to be corrupt"** → ⚙ → **Don't Show Again**. Es esperado.
4. Si macOS lo pide: **Ajustes del Sistema → Privacidad y seguridad → Gestión de apps** → activa Visual Studio Code.

Opcional: si VS Code sigue mostrando su propia rama en la barra inferior, haz clic derecho en la barra inferior y desmarca **Source Control**.

## Después de cada actualización de VS Code

Las actualizaciones borran la inyección. IntelliJ Toolbar la reactiva sola al arrancar y muestra
**Reiniciar VS Code** (ver *Activación automática de la barra de título*). Si lo desactivaste:
`Cmd+Shift+P` → **Enable Custom CSS and JS** y `Cmd+Q`.

## Cambiar el aspecto

Edita `titlebar-inject.js`: colores de las iniciales en `COLORS` y estilos en el bloque `css`. Para ver los cambios: **Reload Custom CSS and JS** (o Enable de nuevo) y reiniciar VS Code.

## Desinstalar

1. En VS Code: `Cmd+Shift+P` → **Disable Custom CSS and JS** → reiniciar.
2. `./setup.sh --desinstalar`

Los demás settings (`titleBarStyle`, `commandCenter`, etc.) se mantienen. Si quieres el estado anterior completo, restaura uno de los respaldos `settings.json.bak-*` de `~/Library/Application Support/Code/User/`.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `code: command not found` | `Cmd+Shift+P` → *Shell Command: Install 'code' command in PATH* |
| Los botones siguen abajo | Faltó *Enable Custom CSS and JS* o reiniciar con `Cmd+Q`; o VS Code se actualizó. |
| Error de permisos al hacer *Enable* | Dar a VS Code el permiso de *Gestión de apps* (ver arriba) y repetir. |
| El menú de ramas no aparece | Abrir una carpeta que sea un repositorio Git; la extensión Git integrada debe estar activa. |
| Quiero generar una nueva versión del `.vsix` | En `intellij-toolbar-vscode/`: `npx @vscode/vsce package` y luego `./setup/setup.sh --basico`. |

## Respaldo de la configuración y Mac nueva

Desinstalar VS Code **no** borra la configuración: `settings.json`, `keybindings.json` y las extensiones viven fuera de la app (`~/Library/Application Support/Code/User/` y `~/.vscode/extensions/`). Al reinstalar solo hay que repetir **Enable Custom CSS and JS** y `Cmd+Q`.

Para una Mac nueva, o si se borra todo, el repo guarda un respaldo en `setup/vscode/`:

| Archivo | Contenido |
|---|---|
| `settings.json`, `keybindings.json` | Copia de los tuyos como plantilla: `{{HOME}}`, `{{PLUGINS}}` y `{{RG_ARCH}}` en lugar de rutas personales |
| `extensions.txt` | Extensiones del Marketplace |
| `own-extensions.json` | Extensiones propias: id, carpeta y repositorio de cada una |

### Mantener el respaldo al día

Cada vez que cambies settings, atajos o extensiones:

```bash
./setup/setup.sh --respaldar
git diff setup/vscode          # revisar
git commit -am "chore: actualizar respaldo de VS Code" && git push
```

### Restaurar en una Mac nueva

**Una sola línea** (en la Terminal de la Mac nueva):

```bash
curl -fsSL https://raw.githubusercontent.com/AngelMinga/intellij-toolbar-vscode/main/setup/bootstrap.sh | bash
```

`setup/bootstrap.sh` instala lo que falte (Command Line Tools de Xcode, Homebrew, VS Code, Node.js), clona
`plugins-intellij` e `intellij-toolbar-vscode` en `~/IdeaProjects/` (o los actualiza si ya están) y ejecuta
`setup.sh --restaurar`. Luego abre VS Code: la barra de título se activa sola y aparece **Reiniciar VS Code**.

**Paso a paso** (lo mismo, a mano):

```bash
mkdir -p ~/IdeaProjects && cd ~/IdeaProjects
git clone https://github.com/AngelMinga/claude-commit.git plugins-intellij   # trae claude-commit-vscode
cd plugins-intellij
git clone https://github.com/AngelMinga/intellij-toolbar-vscode.git
./intellij-toolbar-vscode/setup/setup.sh --restaurar --simular   # ver qué hará
./intellij-toolbar-vscode/setup/setup.sh --restaurar
```

El script:
1. Instala las extensiones del Marketplace que falten.
2. Clona los repos de las extensiones propias que falten (run-config, MultiGit, PhonePane), las compila y las instala.
3. Copia `settings.json` y `keybindings.json` con las rutas de esa Mac (guarda antes una copia `*.bak-<fecha>` de los existentes).
4. Instala Custom CSS and JS Loader.

`--solo-config` restaura solo settings y atajos. Ojo: `java.import.gradle.java.home` apunta a la versión de Java instalada con Homebrew; si en la Mac nueva es otra, ajústala.

### Activación automática de la barra de título

Al arrancar, IntelliJ Toolbar comprueba si la inyección de `titlebar-inject.js` está en VS Code. Si falta
(instalación nueva o VS Code actualizado), ejecuta **Enable Custom CSS and JS** por su cuenta y muestra
**Reiniciar VS Code**, que cierra y vuelve a abrir VS Code. Lo intenta una vez por versión de VS Code; si
macOS lo bloquea, avisa con un botón **Reintentar**.

Para desactivarlo: `"intellijToolbar.autoEnableInjection": false`.

### Settings Sync (opcional)

VS Code puede sincronizar settings, atajos y extensiones del Marketplace con tu cuenta de GitHub:
⚙ → **Backup and Sync Settings…**. Las extensiones propias no se sincronizan (no están en el Marketplace);
de eso se encarga `bootstrap.sh`.
