// Conversões puras entre o HTML salvo (editor rico) e o texto simples que o assistente lê/escreve.
// Compartilhado por todo campo de texto rico do app (Estudos, Documentos, Leitura, Kanban, Academia, ...).

/** Texto simples a partir do HTML rico (pro assistente ler sem gastar tokens com marcação, e pra prévia em listas). */
export function textFromHtml(html: string): string {
  return html
    .replace(/<(p|div|h[1-6]|li|br|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parágrafos de texto simples (um por linha em branco) viram `<p>` — o suficiente pro que o assistente escreve. */
export function paragraphsToHtml(text: string): string {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}
