// Los retratos de los enemigos para sus fichas del menú (models/retratos.png), hechos con sus modelos de verdad en el
// Chromium de Playwright, en el orden de FOE_PIC (src/00_core.js). Al añadir un enemigo, añádelo a FOE_PIC y rehaz la hoja:
//   python3 src/build.py && node tests/retratos.js
// Sin acceso a los CDN, THREE_DIR=<carpeta del paquete three@0.128.0> sirve Three.js y sus examples/js desde ahí
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), T = process.env.THREE_DIR, S = 192;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 300)));
  p.on('console', m => { if (/^PT/.test(m.text())) console.log(m.text()); });
  if (T) {
    await p.route(/three\.min\.js/, r => r.fulfill({ path: path.join(T, 'build/three.min.js'), contentType: 'text/javascript' }));
    await p.route(/GLTFLoader\.js/, r => r.fulfill({ path: path.join(T, 'examples/js/loaders/GLTFLoader.js'), contentType: 'text/javascript' }));
    await p.route(/SkeletonUtils\.js/, r => r.fulfill({ path: path.join(T, 'examples/js/utils/SkeletonUtils.js'), contentType: 'text/javascript' }));
  }
  // el juego, con una puerta para ejecutar código dentro de su ámbito (window.__ev), servido desde la carpeta del proyecto
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); const k = html.trimEnd().lastIndexOf('})();'); html = html.slice(0, k) + 'window.__ev = s => eval(s);\n' + html.slice(k);
  await p.route('http://reparena.local/**', r => {
    const u = decodeURIComponent(new URL(r.request().url()).pathname); if (u === '/' || u === '/index.html') return r.fulfill({ body: html, contentType: 'text/html' });
    const f = path.join(ROOT, u); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ path: f, contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  await p.goto('http://reparena.local/'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__ev(`for (const k in BEAST_DEF) if (BEAST_DEF[k].lazy) beastLoad(k); 1`));
  for (let i = 0; i < 120; i++) { const s = await p.evaluate(() => window.__ev(`(BEAST.ready ? 0 : 1) + Object.values(BEAST_LOAD).filter(v => v === 'loading').length`)); if (!s) break; await p.waitForTimeout(500); }
  const url = await p.evaluate(S => window.__ev(`(() => {
    const S = ${S}, SS = S * 2, keys = FOE_PIC, cols = 7, rows = Math.ceil(keys.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * S; sheet.height = rows * S; const sc = sheet.getContext('2d');
    const rt = new THREE.WebGLRenderTarget(SS, SS); rt.texture.encoding = THREE.sRGBEncoding;
    const scn = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    scn.add(new THREE.HemisphereLight(0xdfe8ff, 0x40302a, 1.0)); const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scn.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.1); rim.position.set(-3, 2, -3); scn.add(rim); scn.add(new THREE.AmbientLight(0xffffff, 0.25));
    const px = new Uint8Array(SS * SS * 4), cv = document.createElement('canvas'); cv.width = cv.height = SS; const cx = cv.getContext('2d'), img = cx.createImageData(SS, SS);
    const build = k => {
      const gate = { robot: 'heavy', thrower: 'imp' }[k] || k;
      let inst, clip = 'Idle_Loop', t = 0.4;
      if (k === 'spider') inst = RIGS.spider.instance({ main: M.chitinSkin, pat: M.abdomenSkin, gloss: M.glossSkin, glow: M.glowSkin });
      else if (k === 'drone') inst = RIGS.drone.instance(MAT_DRONE);
      else if (k === 'hornet') inst = RIGS.stinger.instance(MAT_STINGER);
      else if (['bee', 'bat', 'cthulhu', 'dragon'].includes(k)) { inst = beastFlyer(k); clip = 'Fly'; }
      else if (['crab', 'mushroom'].includes(k)) { const B = BEAST.kinds[k], D = BEAST_DEF[k], model = THREE.SkeletonUtils.clone(B.scene), root = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ map: B.map, roughness: 0.85, metalness: 0, skinning: true, side: THREE.DoubleSide }); model.traverse(m => { if (m.isMesh) { m.material = mat; m.frustumCulled = false; } }); model.scale.setScalar(D.k); root.add(model); inst = { root, model }; }
      else { const r0 = Math.random; Math.random = () => k === 'thrower' ? 0.5 : 0.1; inst = RIGS[gate].instance(MAT_ROBOT); Math.random = r0; }
      const model = inst.model, B = BEAST.kinds[k === 'thrower' ? 'imp' : k];
      if (model && B && B.clips) { const c = B.clips[clip] || B.clips.Idle_Loop; if (c) { const mx = new THREE.AnimationMixer(model); mx.clipAction(c).play(); mx.update(t); } }
      return inst.root;
    };
    keys.forEach((k, i) => {
      const root = build(k); root.rotation.y = 0.45; scn.add(root); root.updateMatrixWorld(true);
      const box = new THREE.Box3(); root.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.frustumCulled = false; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); box.union(bb); } });
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), R = Math.max(sz.y, sz.x * 0.95, sz.z * 0.7) * 0.5;
      const d = R / Math.tan(13 * Math.PI / 180) * 1.12; cam.position.set(c.x + d * 0.05, c.y + d * 0.12, c.z + d); cam.lookAt(c); cam.updateMatrixWorld();
      const prevC = renderer.getClearColor(new THREE.Color()).getHex(), prevA = renderer.getClearAlpha(), xr = renderer.xr.enabled; renderer.xr.enabled = false;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scn, cam); renderer.readRenderTargetPixels(rt, 0, 0, SS, SS, px); renderer.setRenderTarget(null); renderer.setClearColor(prevC, prevA); renderer.xr.enabled = xr;
      for (let y = 0; y < SS; y++) img.data.set(px.subarray((SS - 1 - y) * SS * 4, (SS - y) * SS * 4), y * SS * 4);
      cx.putImageData(img, 0, 0); sc.drawImage(cv, (i % cols) * S, Math.floor(i / cols) * S, S, S);
      console.log('PT', k, sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2));
      scn.remove(root);
    });
    return sheet.toDataURL('image/png');
  })()`), S);
  // 256 colores con transparencia: la hoja pesa unos 100 KB (si está Python con Pillow; si no, tal cual)
  const out = path.join(ROOT, 'models/retratos.png'); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  try { require('child_process').execFileSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)', out]); } catch (e) { console.log('(sin reducir: falta Pillow)'); }
  console.log('models/retratos.png:', fs.statSync(out).size, 'bytes'); await b.close();
})();
