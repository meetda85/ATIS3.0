/* Genera dist/ATIS-3.0.html: un solo archivo con todo adentro (CSS y JS incluidos).
   Uso: node build/build.js */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* Hoja de estilos */
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

/* Scripts */
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>\n/* ' + src + ' */\n' + js + '\n</script>';
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ATIS-3.0.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Generado ' + out + ' (' + Math.round(Buffer.byteLength(html) / 1024) + ' KB)');

/* Variante sin el esqueleto del documento, para publicar la pagina en linea */
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'ATIS 3.0';
const style = (html.match(/<style>[\s\S]*?<\/style>/) || [])[0] || '';
const body = (html.match(/<body>([\s\S]*)<\/body>/) || [])[1] || '';
const page = '<title>' + title + '</title>\n' + style + '\n' + body;
const outPage = path.join(root, 'dist', 'pagina.html');
fs.writeFileSync(outPage, page, 'utf8');
console.log('Generado ' + outPage);
