#!/usr/bin/env python3
"""Respaldo y restauración de la configuración de VS Code (macOS).

  respaldar               settings.json, keybindings.json y lista de extensiones → setup/vscode/
  restaurar [--simular] [--solo-config]
                          instala extensiones (Marketplace y propias) y copia settings/keybindings

Los archivos del repo son plantillas sin datos personales:
  {{PLUGINS}}  carpeta que contiene este repo (p. ej. ~/IdeaProjects/plugins-intellij)
  {{HOME}}     carpeta del usuario
  {{RG_ARCH}}  darwin-arm64 o darwin-x64 (ripgrep de VS Code, usado por Todo Tree)

Variables de entorno para pruebas: VSCODE_USER_DIR (carpeta User de VS Code).
"""
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time

SETUP_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SETUP_DIR)
PLUGINS_ROOT = os.path.dirname(REPO_DIR)
DATA_DIR = os.path.join(SETUP_DIR, 'vscode')
HOME = os.path.expanduser('~')
USER_DIR = os.environ.get('VSCODE_USER_DIR') or os.path.join(HOME, 'Library', 'Application Support', 'Code', 'User')
CONFIG_FILES = ['settings.json', 'keybindings.json']
RG_RE = re.compile(r'/bin/darwin-(?:arm64|x64)/rg')


def info(msg): print(f'\033[1;34m▸\033[0m {msg}')
def ok(msg): print(f'\033[1;32m✔\033[0m {msg}')
def warn(msg): print(f'\033[1;33m!\033[0m {msg}')


def die(msg):
    print(f'\033[1;31m✖\033[0m {msg}', file=sys.stderr)
    sys.exit(1)


def rg_arch():
    return 'darwin-arm64' if platform.machine() == 'arm64' else 'darwin-x64'


def templatize(text):
    text = text.replace(PLUGINS_ROOT, '{{PLUGINS}}').replace(HOME, '{{HOME}}')
    return RG_RE.sub('/bin/{{RG_ARCH}}/rg', text)


def expand(text):
    return (text.replace('{{PLUGINS}}', PLUGINS_ROOT).replace('{{HOME}}', HOME)
            .replace('{{RG_ARCH}}', rg_arch()))


def own_extensions():
    with open(os.path.join(DATA_DIR, 'own-extensions.json'), encoding='utf-8') as f:
        return json.load(f)['extensions']


def code_bin():
    exe = shutil.which('code')
    if not exe:
        die("No se encontró el comando 'code'. En VS Code: Cmd+Shift+P → \"Shell Command: Install 'code' command in PATH\".")
    return exe


def installed_extensions():
    out = subprocess.run([code_bin(), '--list-extensions'], capture_output=True, text=True).stdout
    return [line.strip() for line in out.splitlines() if line.strip() and '.' in line and ' ' not in line.strip()]


# ------------------------------------------------------------------ respaldar

def respaldar():
    os.makedirs(DATA_DIR, exist_ok=True)
    user = os.path.basename(HOME)
    for name in CONFIG_FILES:
        src = os.path.join(USER_DIR, name)
        if not os.path.exists(src):
            warn(f'No existe {src}; se omite.')
            continue
        with open(src, encoding='utf-8') as f:
            text = templatize(f.read())
        with open(os.path.join(DATA_DIR, name), 'w', encoding='utf-8') as f:
            f.write(text)
        if user and user in text:
            warn(f'{name}: todavía contiene "{user}" fuera de las rutas reemplazadas; revísalo antes del commit.')
        ok(f'{name} → setup/vscode/{name}')

    own = {e['id'].lower() for e in own_extensions()}
    market = sorted(e for e in installed_extensions() if e.lower() not in own and not e.lower().startswith('angelminga.'))
    with open(os.path.join(DATA_DIR, 'extensions.txt'), 'w', encoding='utf-8') as f:
        f.write('# Extensiones del Marketplace (las propias están en own-extensions.json)\n')
        f.write('\n'.join(market) + '\n')
    ok(f'{len(market)} extensiones del Marketplace → setup/vscode/extensions.txt')
    info('Revisa los cambios con "git diff setup/vscode" y haz commit.')


# ------------------------------------------------------------------ restaurar

def run(cmd, simular, cwd=None):
    shown = ' '.join(cmd)
    if simular:
        print(f'   [simular] {shown}' + (f'   (en {cwd})' if cwd else ''))
        return True
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        warn(f'Falló: {shown}')
    return r.returncode == 0


def restaurar_extensiones(simular):
    code = code_bin()
    have = {e.lower() for e in installed_extensions()}

    info('Extensiones del Marketplace…')
    with open(os.path.join(DATA_DIR, 'extensions.txt'), encoding='utf-8') as f:
        wanted = [l.strip() for l in f if l.strip() and not l.startswith('#')]
    for ext in wanted:
        if ext.lower() in have:
            continue
        run([code, '--install-extension', ext], simular)

    info('Extensiones propias (se compilan desde su repo)…')
    for e in own_extensions():
        d = os.path.join(PLUGINS_ROOT, e['dir'])
        if not os.path.isdir(d):
            if not e.get('repo'):
                warn(f"{e['id']}: falta la carpeta {d} (viene con el repo plugins-intellij); se omite.")
                continue
            if not run(['git', 'clone', e['repo'], d], simular):
                continue
        pkg_path = os.path.join(d, 'package.json')
        scripts = {}
        if os.path.exists(pkg_path):
            with open(pkg_path, encoding='utf-8') as f:
                scripts = json.load(f).get('scripts', {})
        if 'package' in scripts:
            run(['npm', 'install', '--no-audit', '--no-fund'], simular, cwd=d)
            run(['npm', 'run', 'package'], simular, cwd=d)
        else:
            run(['npx', '--yes', '@vscode/vsce', 'package', '--no-dependencies'], simular, cwd=d)
        if simular:
            print(f"   [simular] {code} --install-extension <último .vsix de {e['dir']}> --force")
            continue
        vsix = sorted((os.path.join(d, f) for f in os.listdir(d) if f.endswith('.vsix')), key=os.path.getmtime)
        if not vsix:
            warn(f"{e['id']}: no se generó ningún .vsix en {d}")
            continue
        run([code, '--install-extension', vsix[-1], '--force'], simular)


def restaurar_config(simular):
    os.makedirs(USER_DIR, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    for name in CONFIG_FILES:
        src = os.path.join(DATA_DIR, name)
        if not os.path.exists(src):
            warn(f'No hay respaldo de {name}; se omite.')
            continue
        dst = os.path.join(USER_DIR, name)
        with open(src, encoding='utf-8') as f:
            text = expand(f.read())
        if simular:
            print(f'   [simular] {name} → {dst}' + (' (con respaldo del actual)' if os.path.exists(dst) else ''))
            continue
        if os.path.exists(dst):
            shutil.copy2(dst, f'{dst}.bak-{stamp}')
            ok(f'Respaldo del actual: {name}.bak-{stamp}')
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(text)
        ok(f'{name} restaurado')


def main(argv):
    if not argv or argv[0] in ('-h', '--ayuda', '--help'):
        print(__doc__)
        return
    cmd, flags = argv[0], set(argv[1:])
    if cmd == 'respaldar':
        respaldar()
    elif cmd == 'restaurar':
        simular = '--simular' in flags
        if '--solo-config' not in flags:
            restaurar_extensiones(simular)
        restaurar_config(simular)
    else:
        die(f'Comando desconocido: {cmd}')


if __name__ == '__main__':
    main(sys.argv[1:])
