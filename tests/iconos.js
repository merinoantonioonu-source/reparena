// Los iconos de la app (para instalar la página en el móvil y para la pestaña del navegador), sacados de icons/logo.svg en
// el Chromium de Playwright. Si cambias el logotipo, rehazlos:
//   node tests/iconos.js
// El de Android («maskable») lleva la marca más pequeña: el sistema lo recorta en círculo o en otra forma y solo respeta
// el 80 % del centro
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'icons'), svg = fs.readFileSync(path.join(DIR, 'logo.svg'), 'utf8');
// la marca (la R y el rayo) ocupa de x 249 a 880 y de y 120 a 800: centrada y al 78 %, cabe en el círculo seguro
const mask = svg.replace('<g id="marca">', '<g id="marca" transform="translate(512 512) scale(.78) translate(-564 -460)">');
const OUT = [['icon-512.png', 512, svg], ['icon-192.png', 192, svg], ['maskable-512.png', 512, mask], ['apple-touch-icon.png', 180, svg], ['favicon-32.png', 32, svg]];
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 600, height: 600 } });
  for (const [name, size, src] of OUT) {
    await p.setContent(`<!doctype html><html><body style="margin:0;background:#000">${src.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
    await p.screenshot({ path: path.join(DIR, name), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(name, size);
  }
  await b.close();
})();
