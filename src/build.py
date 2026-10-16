#!/usr/bin/env python3
"""Une src/page.html y los módulos src/NN_*.js en index.html (lo que sirve GitHub Pages)."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(here, '[0-9][0-9]_*.js'))))
page = open(os.path.join(here, 'page.html'), encoding='utf-8').read()
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(page.replace('/*__JS__*/', js))
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
open(os.path.join(root, 'build', 'game.js'), 'w', encoding='utf-8').write(js)
print('index.html generado:', js.count('\n'), 'líneas de JS')
