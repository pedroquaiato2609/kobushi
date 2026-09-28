import sanitizeHtml from 'sanitize-html';

// Só as tags/atributos que o editor (TipTap StarterKit + Image/Link/TaskList/CodeBlock) realmente produz.
// Nunca script/style/iframe/on*; href e src passam pelo filtro de esquema do sanitize-html (sem "javascript:"/"data:").
// Compartilhado por todo campo de texto rico do app (Estudos, Documentos, Leitura, Kanban, Academia, ...).
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h1', 'h2', 'h3', 'strong', 'em', 's', 'u', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'hr', 'br', 'div', 'span', 'label', 'input'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    li: ['data-type', 'data-checked'],
    ul: ['data-type'],
    input: ['type', 'checked', 'disabled'],
    span: ['class'],
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: { img: ['http', 'https'] }, // nunca data: (evita HTML gigante embutido) nem outros esquemas
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
};
export const sanitizeRichHtml = (html: string) => sanitizeHtml(html, SANITIZE_OPTIONS);
