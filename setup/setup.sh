#!/usr/bin/env bash
# Instala / desinstala la barra estilo IntelliJ en VS Code (macOS).
#
# Uso:
#   ./setup.sh               Instalación completa (extensión + inyección en barra de título + settings)
#   ./setup.sh --basico      Solo extensión + settings (botones en la barra inferior, sin inyección)
#   ./setup.sh --settings    Solo vuelve a aplicar los settings
#   ./setup.sh --desinstalar Quita la extensión, el loader y los settings agregados
#   ./setup.sh --ayuda       Muestra esta ayuda
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INJECT_JS="$PLUGIN_DIR/titlebar-inject.js"
SETTINGS="${VSCODE_SETTINGS:-$HOME/Library/Application Support/Code/User/settings.json}"
LOADER_ID="be5invis.vscode-custom-css"
EXT_ID="angelminga.intellij-toolbar"

info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

ayuda() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; }

require_code() {
  command -v code >/dev/null 2>&1 || die "No se encontró el comando 'code'. En VS Code: Cmd+Shift+P → 'Shell Command: Install 'code' command in PATH'."
  command -v python3 >/dev/null 2>&1 || die "Se necesita python3."
}

latest_vsix() {
  ls -1 "$PLUGIN_DIR"/intellij-toolbar-*.vsix 2>/dev/null | sort -V | tail -1
}

backup_settings() {
  [ -f "$SETTINGS" ] || { mkdir -p "$(dirname "$SETTINGS")"; echo '{}' > "$SETTINGS"; }
  local bak="$SETTINGS.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$SETTINGS" "$bak"
  ok "Respaldo de settings: $bak"
}

# Aplica (mode=set) o quita (mode=unset) claves en settings.json respetando comentarios.
edit_settings() {
  local mode="$1" with_inject="$2"
  python3 - "$SETTINGS" "$mode" "$with_inject" "$INJECT_JS" <<'PY'
import json, re, sys
path, mode, with_inject, inject = sys.argv[1:5]
s = open(path, encoding="utf-8").read()

values = {
    "window.titleBarStyle": "custom",
    "workbench.editor.editorActionsLocation": "titleBar",
    "window.commandCenter": True,
    "window.title": "${rootName}   ⎇ ${activeRepositoryBranchName}",
    "debug.showInStatusBar": "never",
    "git-graph.showStatusBarItem": False,
}
if with_inject == "1":
    values["vscode_custom_css.imports"] = ["file://" + inject]

def key_re(k):
    # "clave": valor  (valor simple o arreglo de una o varias líneas)
    return re.compile(r'(\n[ \t]*)"' + re.escape(k) + r'"\s*:\s*(\[[^\]]*\]|"(?:[^"\\]|\\.)*"|true|false|-?\d+(?:\.\d+)?)(\s*,)?')

def fmt(v):
    if isinstance(v, list):
        return "[\n        " + ",\n        ".join(json.dumps(x, ensure_ascii=False) for x in v) + "\n    ]"
    return json.dumps(v, ensure_ascii=False)

if mode == "set":
    for k, v in values.items():
        r = key_re(k)
        if r.search(s):
            s = r.sub(lambda m: m.group(1) + json.dumps(k) + ": " + fmt(v) + (m.group(3) or ""), s, count=1)
        else:
            end = s.rstrip().rfind("}")
            body = s[:end].rstrip()
            sep = "" if body.endswith("{") or body.endswith(",") else ","
            s = body + sep + "\n    " + json.dumps(k) + ": " + fmt(v) + "\n}\n"
elif mode == "unset":
    for k in ["vscode_custom_css.imports"]:
        s = key_re(k).sub("", s)
    s = re.sub(r"\n[ \t]*// Botones de proyecto y rama en la barra de título[^\n]*", "", s)
    s = re.sub(r",(\s*})\s*$", r"\1\n", s)

open(path, "w", encoding="utf-8").write(s)
PY
}

install_extension() {
  local vsix; vsix="$(latest_vsix)"
  [ -n "$vsix" ] || die "No hay ningún intellij-toolbar-*.vsix en $PLUGIN_DIR (genera uno con: npx @vscode/vsce package)."
  info "Instalando $(basename "$vsix")…"
  code --install-extension "$vsix" --force 2>&1 | grep -vi deprecat || true
  ok "Extensión IntelliJ Toolbar instalada."
}

install_loader() {
  [ -f "$INJECT_JS" ] || die "No se encontró $INJECT_JS"
  info "Instalando Custom CSS and JS Loader…"
  code --install-extension "$LOADER_ID" 2>&1 | grep -vi deprecat || true
  ok "Loader instalado."
}

pasos_finales() {
  cat <<EOF

────────────────────────────────────────────────────────────
 Pasos manuales (VS Code no permite automatizarlos):
   1. Cmd+Shift+P → "Enable Custom CSS and JS"
   2. Cerrar VS Code por completo (Cmd+Q) y volver a abrirlo
   3. Si aparece "installation appears to be corrupt" → ⚙ → "Don't Show Again"
 Si macOS lo pide: Ajustes del Sistema → Privacidad y seguridad →
 Gestión de apps → activar Visual Studio Code.
 Tras cada actualización de VS Code repite los pasos 1 y 2.
────────────────────────────────────────────────────────────
EOF
}

case "${1:-}" in
  ""|--completo)
    require_code
    install_extension
    install_loader
    backup_settings
    edit_settings set 1
    ok "Settings aplicados."
    pasos_finales
    ;;
  --basico)
    require_code
    install_extension
    backup_settings
    edit_settings set 0
    ok "Settings aplicados. Recarga la ventana: Cmd+Shift+P → 'Developer: Reload Window'."
    ;;
  --settings)
    require_code
    backup_settings
    edit_settings set "$( [ -f "$INJECT_JS" ] && echo 1 || echo 0 )"
    ok "Settings aplicados."
    ;;
  --desinstalar)
    require_code
    warn "Antes de seguir: en VS Code ejecuta Cmd+Shift+P → 'Disable Custom CSS and JS' y reinicia,"
    warn "o la inyección quedará activa hasta la próxima actualización de VS Code."
    read -r -p "¿Ya lo hiciste y quieres continuar? [s/N] " r
    [[ "$r" =~ ^[sS]$ ]] || { info "Cancelado."; exit 0; }
    backup_settings
    edit_settings unset 0
    code --uninstall-extension "$LOADER_ID" 2>&1 | grep -vi deprecat || true
    code --uninstall-extension "$EXT_ID" 2>&1 | grep -vi deprecat || true
    ok "Desinstalado. Reinicia VS Code."
    ;;
  -h|--ayuda|--help) ayuda ;;
  *) ayuda; exit 1 ;;
esac
