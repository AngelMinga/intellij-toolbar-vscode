#!/usr/bin/env python3
"""Genera "Islands Dark (código VS Code)": interfaz de Islands Dark (IntelliJ) + colores de código por defecto de VS Code.

Toma la interfaz de islands-dark-intellij-color-theme.json y los colores de código (tokenColors,
semanticTokenColors, color del texto y de las llaves) del tema por defecto de VS Code ("Dark 2026",
que incluye Dark Modern → Dark+ → Dark VS). Volver a ejecutarlo tras una actualización de VS Code:

    python3 themes/build_vscode_code_variant.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
VSCODE_THEMES = os.environ.get(
    'VSCODE_THEMES',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/theme-defaults/themes')
BASE_THEME = '2026-dark.json'
ISLANDS = os.path.join(HERE, 'islands-dark-intellij-color-theme.json')
OUT = os.path.join(HERE, 'islands-dark-vscode-code-color-theme.json')

# Colores del editor que pertenecen al "código" y se toman de VS Code (el resto de la interfaz queda de Islands).
CODE_COLORS = re.compile(r'^(editor\.foreground|editorBracketHighlight\..*|editorBracketPairGuide\..*)$')


def load_jsonc(path):
    text = open(path, encoding='utf-8').read()
    out, i, n, in_str = [], 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(text[i + 1]); i += 2; continue
            if c == '"':
                in_str = False
        elif c == '"':
            in_str = True; out.append(c)
        elif text.startswith('//', i):
            while i < n and text[i] != '\n':
                i += 1
            continue
        elif text.startswith('/*', i):
            i = text.find('*/', i + 2) + 2; continue
        else:
            out.append(c)
        i += 1
    return json.loads(re.sub(r',(\s*[}\]])', r'\1', ''.join(out)))


def load_chain(name):
    """Tema con sus "include" resueltos: lo incluido primero, lo propio encima."""
    t = load_jsonc(os.path.join(VSCODE_THEMES, name))
    merged = {'colors': {}, 'tokenColors': [], 'semanticTokenColors': {}, 'semanticHighlighting': False}
    if t.get('include'):
        merged = load_chain(os.path.basename(t['include']))
    merged['colors'].update(t.get('colors', {}))
    merged['tokenColors'] += t.get('tokenColors', []) if isinstance(t.get('tokenColors'), list) else []
    merged['semanticTokenColors'].update(t.get('semanticTokenColors', {}))
    merged['semanticHighlighting'] = merged['semanticHighlighting'] or bool(t.get('semanticHighlighting'))
    return merged


def main():
    code = load_chain(BASE_THEME)
    islands = json.load(open(ISLANDS, encoding='utf-8'))
    colors = {k: v for k, v in islands['colors'].items() if not CODE_COLORS.match(k)}
    colors.update({k: v for k, v in code['colors'].items() if CODE_COLORS.match(k)})
    theme = {
        '$schema': 'vscode://schemas/color-theme',
        'name': 'Islands Dark (código VS Code)',
        'type': 'dark',
        'semanticHighlighting': True,
        'colors': colors,
        'tokenColors': code['tokenColors'],
        'semanticTokenColors': code['semanticTokenColors'],
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(theme, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'{os.path.basename(OUT)}: {len(colors)} colores de interfaz, '
          f'{len(code["tokenColors"])} reglas de código, {len(code["semanticTokenColors"])} semánticas '
          f'(base: {BASE_THEME})')


if __name__ == '__main__':
    main()
