// Busca de metadados (título, autor, páginas, capa) por ISBN em serviços públicos, sem chave de API.
import { ProviderError } from '../../domain/errors';
import { normalizeName } from '../../domain/gym';

// Palavras sem valor de busca (mesma lista usada na resolução de exercícios/livros por nome).
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'e', 'ou', 'a', 'o', 'as', 'os', 'um', 'uma', 'the', 'of', 'and']);
const keywordsOf = (s: string): string[] => normalizeName(s).split(' ').filter((w) => w.length >= 3 && !STOPWORDS.has(w));

export interface BookLookupResult { title: string; author: string; publisher: string; totalPages: number | null; coverUrl: string | null }
export interface BookLookup { find(isbn: string): Promise<BookLookupResult | null> }

const TIMEOUT_MS = 4500;
const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma falha de REDE (timeout, conexão resetada — TLS soltando a conexão do nada é comum nesses serviços
 * públicos, sobretudo com keep-alive; um socket reaproveitado que já morreu do outro lado quebra assim) tenta
 * de novo — cada tentativa abre uma conexão nova, o que já evita o socket morto. Uma resposta HTTP de erro
 * (429, 404...) não tenta de novo aqui — quem chama (FallbackBookLookup/FallbackBookSearch) já consulta a
 * próxima fonte em paralelo, então uma única fonte lenta nunca soma o tempo de espera das outras.
 */
async function getJson(url: string, attempt = 1): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', connection: 'close' } });
    if (!res.ok) throw new ProviderError(`Busca do livro falhou (${res.status}).`);
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (attempt < MAX_ATTEMPTS) { await sleep(250 * attempt); return getJson(url, attempt + 1); }
    throw new ProviderError('Não consegui buscar o livro agora (sem resposta do serviço). Tente de novo ou cadastre à mão.');
  } finally {
    clearTimeout(timer);
  }
}

/** Capa direta por ISBN, sem precisar de metadados — existe mesmo quando o Google Books não acha o livro. */
export const openLibraryCoverUrl = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;

// Quando o Open Library não tem a capa daquele ISBN, essa URL não dá 404: devolve um GIF de 1×1 pixel (43
// bytes) que "carrega" normalmente no navegador — sem isso, a tela mostraria essa imagem minúscula/quebrada em
// vez de cair no retrato com as iniciais do livro. Uma capa de verdade tem sempre muito mais que isso.
const MIN_REAL_COVER_BYTES = 500;
/** Só devolve a URL da capa direta se ela realmente existir (checando o tamanho); senão, null. */
export async function realOpenLibraryCover(isbn: string): Promise<string | null> {
  const url = openLibraryCoverUrl(isbn);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { connection: 'close' } });
    const len = Number(res.headers.get('content-length') ?? '0');
    return res.ok && len > MIN_REAL_COVER_BYTES ? url : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/**
 * Google Books: sem chave para volume de uso pessoal, cobre a maioria dos ISBNs com título/autor/páginas/capa —
 * mas sem chave o limite por IP é curto e aparece como 429 com alguma frequência. Espera um ISBN já validado e
 * normalizado (só dígitos/X) — isso é responsabilidade de quem chama.
 */
export class GoogleBooksLookup implements BookLookup {
  async find(isbn: string): Promise<BookLookupResult | null> {
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
    const info = data?.items?.[0]?.volumeInfo;
    if (!info) return null; // ISBN válido mas não achado nesta fonte: quem chama tenta a próxima
    const cover: string | undefined = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
    return {
      title: info.title ?? '',
      author: (info.authors ?? []).join(', '),
      publisher: info.publisher ?? '',
      totalPages: typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : null,
      coverUrl: cover ? cover.replace(/^http:/, 'https:') : null,
    };
  }
}

/** Open Library (API de dados, não só a capa): outra fonte, com outro limite de uso — cobre o que o Google Books perder. */
export class OpenLibraryLookup implements BookLookup {
  async find(isbn: string): Promise<BookLookupResult | null> {
    const data = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`);
    const info = data?.[`ISBN:${isbn}`];
    if (!info) return null;
    return {
      title: info.title ?? '',
      author: (info.authors ?? []).map((a: { name?: string }) => a.name).filter(Boolean).join(', '),
      publisher: (info.publishers ?? []).map((p: { name?: string }) => p.name).filter(Boolean).join(', '),
      totalPages: typeof info.number_of_pages === 'number' && info.number_of_pages > 0 ? info.number_of_pages : null,
      coverUrl: info.cover?.large ?? info.cover?.medium ?? null,
    };
  }
}

/**
 * Consulta TODAS as fontes em paralelo (não uma de cada vez) — uma fonte lenta ou fora do ar nunca soma o
 * tempo de espera das outras, só o tempo da mais lenta. Combina o que cada uma achou (a ordem da lista decide
 * a prioridade quando mais de uma tem o mesmo campo); sem capa de nenhuma, usa a capa direta do Open Library
 * por ISBN. Só devolve null quando NENHUMA fonte achou nada — erros isolados não contam como "não achei".
 */
export class FallbackBookLookup implements BookLookup {
  /** `coverFallback` é injetável (só para teste, sem sair na rede de verdade) — padrão real: realOpenLibraryCover. */
  constructor(private sources: BookLookup[], private coverFallback: (isbn: string) => Promise<string | null> = realOpenLibraryCover) {}
  async find(isbn: string): Promise<BookLookupResult | null> {
    const settled = await Promise.allSettled(this.sources.map((s) => s.find(isbn)));
    const results = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
    if (results.length === 0) {
      const cover = await this.coverFallback(isbn);
      return cover ? { title: '', author: '', publisher: '', totalPages: null, coverUrl: cover } : null;
    }
    const merged: BookLookupResult = results.reduce((acc, r) => ({
      title: acc.title || r.title, author: acc.author || r.author, publisher: acc.publisher || r.publisher,
      totalPages: acc.totalPages ?? r.totalPages, coverUrl: acc.coverUrl || r.coverUrl,
    }));
    if (!merged.coverUrl) merged.coverUrl = await this.coverFallback(isbn);
    return merged;
  }
}

// ---- busca por título/autor (quando não se tem o ISBN em mãos) --------------------------

export interface BookSearchHit { title: string; author: string; isbn: string | null; coverUrl: string | null; year: string | null; totalPages: number | null }
export interface BookSearch { search(query: string): Promise<BookSearchHit[]> }

export class GoogleBooksSearch implements BookSearch {
  async search(query: string): Promise<BookSearchHit[]> {
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=15`);
    const items: any[] = data?.items ?? [];
    return items.map((it): BookSearchHit => {
      const info = it.volumeInfo ?? {};
      const ids: { type: string; identifier: string }[] = info.industryIdentifiers ?? [];
      const isbn = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? ids.find((x) => x.type === 'ISBN_10')?.identifier ?? null;
      const cover: string | undefined = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
      return {
        title: info.title ?? '', author: (info.authors ?? []).join(', '), isbn,
        coverUrl: cover ? cover.replace(/^http:/, 'https:') : null,
        year: typeof info.publishedDate === 'string' ? info.publishedDate.slice(0, 4) : null,
        totalPages: typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : null,
      };
    }).filter((h) => h.title);
  }
}

export class OpenLibrarySearch implements BookSearch {
  async search(query: string): Promise<BookSearchHit[]> {
    const data = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=15&fields=title,author_name,cover_i,first_publish_year,isbn`);
    const docs: any[] = data?.docs ?? [];
    return docs.map((d): BookSearchHit => ({
      title: d.title ?? '', author: (d.author_name ?? []).join(', '),
      isbn: Array.isArray(d.isbn) && d.isbn.length ? d.isbn[0] : null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      year: d.first_publish_year ? String(d.first_publish_year) : null,
      totalPages: null,
    })).filter((h) => h.title);
  }
}

/**
 * Consulta todas as fontes em paralelo; usa a primeira da lista (na ordem original) que devolveu algo relevante.
 * A busca em texto livre de algumas fontes (Open Library, sobretudo) às vezes "acha" um livro sem nenhuma
 * palavra em comum com o que foi pedido quando não existe nada parecido de verdade — filtra esse ruído: um
 * resultado só entra se pelo menos uma palavra do título/autor pedido aparecer no título/autor devolvido.
 * Sem capa vinda da fonte mas com ISBN, cai para a capa direta do Open Library (não depende de metadados).
 */
export class FallbackBookSearch implements BookSearch {
  /** `coverFallback` é injetável (só para teste, sem sair na rede de verdade) — padrão real: realOpenLibraryCover. */
  constructor(private sources: BookSearch[], private coverFallback: (isbn: string) => Promise<string | null> = realOpenLibraryCover) {}
  async search(query: string): Promise<BookSearchHit[]> {
    const qWords = keywordsOf(query);
    const relevant = (h: BookSearchHit) => {
      if (!qWords.length) return true;
      const hitWords = keywordsOf(`${h.title} ${h.author}`);
      return qWords.some((w) => hitWords.some((h2) => h2.includes(w) || w.includes(h2)));
    };
    const withCover = async (h: BookSearchHit): Promise<BookSearchHit> => (h.coverUrl || !h.isbn ? h : { ...h, coverUrl: await this.coverFallback(h.isbn) });

    const settled = await Promise.allSettled(this.sources.map((s) => s.search(query)));
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      const filtered = r.value.filter(relevant);
      if (filtered.length) return Promise.all(filtered.map(withCover));
    }
    return [];
  }
}
