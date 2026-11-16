#!/usr/bin/env bash
# Instalación en una Mac nueva con una sola línea:
#
#   curl -fsSL https://raw.githubusercontent.com/AngelMinga/intellij-toolbar-vscode/main/setup/bootstrap.sh | bash
#
# Instala lo que falte (Homebrew → VS Code, Node.js), clona los repos en ~/IdeaProjects/plugins-intellij
# (o los actualiza si ya están) y ejecuta "setup.sh --restaurar": extensiones del Marketplace y propias,
# settings, atajos y Custom CSS and JS Loader. Al abrir VS Code, IntelliJ Toolbar activa sola la barra de
# título y pide reiniciar.
#
# Variables opcionales: PLUGINS_DIR (por defecto ~/IdeaProjects/plugins-intellij).
set -euo pipefail

PLUGINS_DIR="${PLUGINS_DIR:-$HOME/IdeaProjects/plugins-intellij}"
PLUGINS_REPO="https://github.com/AngelMinga/claude-commit.git"
TOOLBAR_REPO="https://github.com/AngelMinga/intellij-toolbar-vscode.git"
VSCODE_APP="/Applications/Visual Studio Code.app"

info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || die "Este instalador es para macOS."

# git y python3 vienen con las Command Line Tools de Xcode.
if ! xcode-select -p >/dev/null 2>&1; then
  info "Instalando las Command Line Tools de Xcode (git, python3)…"
  xcode-select --install || true
  die "Termina la instalación de las Command Line Tools en la ventana que se abrió y vuelve a ejecutar este comando."
fi

brew_bin() {
  command -v brew 2>/dev/null || { [ -x /opt/homebrew/bin/brew ] && echo /opt/homebrew/bin/brew; } || { [ -x /usr/local/bin/brew ] && echo /usr/local/bin/brew; } || true
}
need_brew() {
  local b; b="$(brew_bin)"
  if [ -z "$b" ]; then
    info "Instalando Homebrew…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty
    b="$(brew_bin)"
    [ -n "$b" ] || die "No se pudo instalar Homebrew."
  fi
  eval "$("$b" shellenv)"
}

if [ ! -d "$VSCODE_APP" ]; then
  need_brew
  info "Instalando Visual Studio Code…"
  brew install --cask visual-studio-code
fi
# El comando 'code' sin depender de "Install 'code' command in PATH".
export PATH="$VSCODE_APP/Contents/Resources/app/bin:$PATH"
command -v code >/dev/null || die "No se encontró el comando 'code' en $VSCODE_APP."

if ! command -v node >/dev/null 2>&1; then
  need_brew
  info "Instalando Node.js (para compilar las extensiones propias)…"
  brew install node
fi

clone_or_pull() {
  local repo="$1" dir="$2"
  if [ -d "$dir/.git" ]; then
    info "Actualizando $(basename "$dir")…"
    git -C "$dir" pull --ff-only || warn "No se pudo actualizar $dir (¿cambios locales?); se usa tal cual."
  else
    info "Clonando $(basename "$dir")…"
    git clone "$repo" "$dir"
  fi
}

mkdir -p "$(dirname "$PLUGINS_DIR")"
clone_or_pull "$PLUGINS_REPO" "$PLUGINS_DIR"
clone_or_pull "$TOOLBAR_REPO" "$PLUGINS_DIR/intellij-toolbar-vscode"

bash "$PLUGINS_DIR/intellij-toolbar-vscode/setup/setup.sh" --restaurar

cat <<EOF

────────────────────────────────────────────────────────────
 Listo. Abre VS Code: IntelliJ Toolbar activará sola la barra de
 título y te pedirá reiniciar ("Reiniciar VS Code").
 Si macOS lo bloquea: Ajustes del Sistema → Privacidad y seguridad →
 Gestión de apps → activar Visual Studio Code.
────────────────────────────────────────────────────────────
EOF
