// Concatenate src/ into one self-contained orbit.html.
import fs from 'node:fs';
const src = f => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const exists = f => fs.existsSync(new URL('../src/' + f, import.meta.url));
const glsl = ['header.glsl', 'common.glsl', 'atmo.glsl', 'clouds.glsl', 'surface.glsl', 'main.glsl'].map(src).join('\n');
const js = ['terrain.js', 'site.js', 'path.js', 'gl.js', 'flight.js', 'hud.js', 'app.js', 'live.js'].filter(exists).map(src).join('\n');
const html = src('index.html')
  .replace('/*__JS__*/', () => 'const SCENE_FS = `' + glsl + '`;\n' + js);
const out = html.replace('/*__KB__*/0', String(Math.round(html.length / 1024)));
fs.writeFileSync(new URL('../orbit.html', import.meta.url), out);
// the same file again under the name a web host serves by default
fs.writeFileSync(new URL('../index.html', import.meta.url), out);
console.log('orbit.html', (html.length / 1024).toFixed(1) + ' KB', html.split('\n').length + ' lines');
