#!/usr/bin/env python3
"""Une src/page.html y los módulos src/NN_*.js en index.html (lo que sirve GitHub Pages)."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(here, '[0-9][0-9]_*.js'))))
page = open(os.path.join(here, 'page.html'), encoding='utf-8').read()

# Al final de la página, la lista de sonidos que se pueden cambiar, sacada de sounds/LEEME.md (así no se desfasan)
import re, html
def inline(t):
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', t)
def sounds_html():
    groups, cur = [], None
    for line in open(os.path.join(root, 'sounds', 'LEEME.md'), encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('## ') or line.startswith('### '):
            cur = [line.lstrip('#').strip(), []]; groups.append(cur); continue
        m = re.match(r'^\| `([a-z0-9\-]+)` \| (.*) \|\s*$', line)
        if m and cur: cur[1].append((m.group(1), m.group(2)))
    out = ['<section class="sounds" id="soundsBox">', '<h2>Sonidos que puedes cambiar</h2>',
           '<p class="note">Sube a la carpeta <code>sounds/</code> del repositorio un archivo <code>.mp3</code>, <code>.ogg</code> o <code>.wav</code> con el nombre exacto (por ejemplo <code>rayo.mp3</code>) y el juego lo usará en lugar del sonido sintetizado. En GitHub: carpeta <code>sounds</code> → <b>Add file → Upload files</b> → <b>Commit changes</b>.</p>']
    for title, rows in groups:
        if not rows: continue
        out.append('<h3>' + inline(title) + '</h3><div class="sndlist">')
        out += ['<div class="snd"><code>' + n + '</code><span>' + inline(d) + '</span></div>' for n, d in rows]
        out.append('</div>')
    out.append('</section>')
    return '\n'.join(out)
page = page.replace('<!--__SOUNDS__-->', sounds_html())
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(page.replace('/*__JS__*/', js))
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
open(os.path.join(root, 'build', 'game.js'), 'w', encoding='utf-8').write(js)
print('index.html generado:', js.count('\n'), 'líneas de JS')
