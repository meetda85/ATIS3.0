/* Genera las dos variantes de distribución:
     dist/ATIS-3.0.html  un solo archivo con todo adentro (uso sin instalar / USB)
     dist/pagina.html    para publicar en línea; la librería de hojas de cálculo
                         se toma de un CDN porque lleva caracteres que no se
                         pueden incrustar en una página publicada.
   Uso: node build/build.js */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CDN_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const base = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function inline(html, vendorDesdeCdn) {
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
    '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');

  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    if (vendorDesdeCdn && src.indexOf('js/vendor/') === 0) {
      return '<script src="' + CDN_XLSX + '"></script>';
    }
    return '<script>\n/* ' + src + ' */\n' + fs.readFileSync(path.join(root, src), 'utf8') + '\n</script>';
  });
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const portable = inline(base, false);
const outPortable = path.join(root, 'dist', 'ATIS-3.0.html');
fs.writeFileSync(outPortable, portable, 'utf8');
console.log('Generado ' + outPortable + ' (' + Math.round(Buffer.byteLength(portable) / 1024) + ' KB)');

/* Variante sin el esqueleto del documento, para publicar la página en línea */
const conCdn = inline(base, true);
const title = (conCdn.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'ATIS 3.0';
const style = (conCdn.match(/<style>[\s\S]*?<\/style>/) || [])[0] || '';
const body = (conCdn.match(/<body>([\s\S]*)<\/body>/) || [])[1] || '';
const page = '<title>' + title + '</title>\n' + style + '\n' + body;
const outPage = path.join(root, 'dist', 'pagina.html');
fs.writeFileSync(outPage, page, 'utf8');
console.log('Generado ' + outPage + ' (' + Math.round(Buffer.byteLength(page) / 1024) + ' KB)');
