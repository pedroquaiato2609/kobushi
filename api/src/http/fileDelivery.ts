// Arquivos enviados pelo usuário são servidos na MESMA origem do app. Um HTML/SVG aberto ali executaria script
// com acesso à API (XSS armazenado). Por isso só tipos que o navegador exibe sem executar código abrem inline;
// todo o resto é forçado a download como binário genérico.
const INLINE_SAFE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif)|text\/plain)(;.*)?$/i;

export function fileDelivery(mime: string | null | undefined, filename: string) {
  const declared = (mime ?? '').trim();
  const inline = INLINE_SAFE.test(declared);
  return {
    contentType: inline ? declared : 'application/octet-stream',
    disposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    // Mesmo o que abre inline roda isolado: sem script, sem acesso a cookies/API.
    csp: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  };
}
