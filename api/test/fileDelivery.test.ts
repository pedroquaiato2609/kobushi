import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileDelivery } from '../src/http/fileDelivery';

test('HTML, SVG e JS enviados nunca abrem inline (evita XSS armazenado)', () => {
  for (const mime of ['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/xhtml+xml', 'application/xml', '', null]) {
    const d = fileDelivery(mime, 'x');
    assert.equal(d.contentType, 'application/octet-stream', String(mime));
    assert.match(d.disposition, /^attachment/);
  }
});

test('PDF, imagens raster e texto puro abrem inline, com CSP isolada', () => {
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain; charset=utf-8']) {
    const d = fileDelivery(mime, 'nota.pdf');
    assert.match(d.disposition, /^inline/);
    assert.equal(d.contentType, mime);
  }
  assert.match(fileDelivery('image/png', 'a').csp, /sandbox/);
});

test('nome de arquivo com aspas e quebra de linha não injeta cabeçalho', () => {
  const d = fileDelivery('application/pdf', 'a"\r\nSet-Cookie: x=1.pdf');
  assert.doesNotMatch(d.disposition, /[\r\n"]/);
});
