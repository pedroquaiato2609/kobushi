import type { TextExtractor } from '../../application/library';

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|log|yml|yaml|ini|rtf)$/i;

/** Texto pesquisável dos arquivos enviados. Texto puro e PDF; imagens e outros formatos ficam sem texto. */
export const extractText: TextExtractor = async (mime, filename, data) => {
  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXT.test(filename)) return data.toString('utf8');
  if (mime === 'application/pdf' || /\.pdf$/i.test(filename)) {
    const spec = 'pdf-parse/lib/pdf-parse.js'; // caminho direto: o índice do pacote tenta ler um arquivo de teste
    const mod: any = await import(spec);
    const parse = mod.default ?? mod;
    const out = await parse(data);
    return String(out.text ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return '';
};
