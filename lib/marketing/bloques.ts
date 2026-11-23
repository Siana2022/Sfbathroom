export type BloqueEmail =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagen'; url: string; enlace?: string; alt?: string }
  | { tipo: 'boton'; texto: string; url: string }
  | { tipo: 'separador' };

export function bloqueVacio(tipo: BloqueEmail['tipo']): BloqueEmail {
  switch (tipo) {
    case 'titulo':
      return { tipo, texto: 'Título' };
    case 'texto':
      return { tipo, texto: 'Escribe aquí el contenido…' };
    case 'imagen':
      return { tipo, url: '', alt: '' };
    case 'boton':
      return { tipo, texto: 'Ver más', url: 'https://sfbathroom.com' };
    default:
      return { tipo } as BloqueEmail;
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderizarEmail(bloques: BloqueEmail[], bajaUrl: string): string {
  const cuerpo = bloques
    .map((b) => {
      switch (b.tipo) {
        case 'titulo':
          return `<h2 style="margin:0 0 12px;font:700 22px/1.3 Georgia,serif;color:#1f2933">${esc(b.texto)}</h2>`;
        case 'texto':
          return `<p style="margin:0 0 14px;font:400 15px/1.6 Arial,sans-serif;color:#3e4c59;white-space:pre-line">${esc(b.texto)}</p>`;
        case 'imagen':
          return b.url
            ? `<div style="margin:0 0 14px">${b.enlace ? `<a href="${esc(b.enlace)}">` : ''}<img src="${esc(b.url)}" alt="${esc(b.alt ?? '')}" style="max-width:100%;border-radius:8px;display:block">${b.enlace ? '</a>' : ''}</div>`
            : '';
        case 'boton':
          return `<div style="margin:0 0 16px"><a href="${esc(b.url)}" style="display:inline-block;background:#1f3a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font:600 15px Arial,sans-serif">${esc(b.texto)}</a></div>`;
        case 'separador':
          return '<hr style="border:none;border-top:1px solid #d9e2ec;margin:18px 0">';
        default:
          return '';
      }
    })
    .join('');

  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    ${cuerpo}
    <p style="margin:24px 0 0;font:12px/1.5 Arial,sans-serif;color:#9aa5b1">
      Recibes este correo porque mantienes relación comercial con sfbathroom.
      <a href="${esc(bajaUrl)}" style="color:#9aa5b1">Darse de baja</a>.
    </p>
  </div>
</body></html>`;
}
