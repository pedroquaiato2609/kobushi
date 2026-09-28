import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { TextPromptModal } from './TextPromptModal';

const Btn = ({ active, disabled, onClick, title, children }: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
  <button type="button" className={`rich-btn${active ? ' on' : ''}`} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title} aria-pressed={active}>{children}</button>
);

/**
 * Editor de texto rico (TipTap): negrito, itálico, riscado, títulos, listas (com tarefa marcável), citação,
 * bloco de código, link, imagem embutida (upload direto pro servidor) e linha divisória. Compartilhado por
 * todo campo de texto longo do app (Estudos, Documentos, Leitura, Kanban, Academia, ...).
 * `onChange` dispara a cada edição (estado local); `onBlur` é o gancho pra salvar.
 * `uploadUrl` aponta pro endpoint de upload de imagem — o mesmo endpoint serve qualquer módulo, não é exclusivo de um.
 */
export function RichEditor({ content, onChange, onBlur, editable = true, autofocus = false, uploadUrl = '/api/study/images', placeholder = 'Escreva algo… use a barra acima para títulos, listas, imagens…' }: {
  content: string; onChange: (html: string) => void; onBlur?: () => void; editable?: boolean; autofocus?: boolean; uploadUrl?: string; placeholder?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [linkPrompt, setLinkPrompt] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    autofocus,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onBlur: () => onBlur?.(),
  });

  // conteúdo trocou por fora (ex.: abriu outra nota) — não pisa em cima de quem está digitando
  useEffect(() => {
    if (editor && !editor.isFocused && content !== editor.getHTML()) editor.commands.setContent(content, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  const uploadImage = async (f: File) => {
    setUploadErr(null);
    try {
      const body = new FormData(); body.append('file', f);
      const res = await fetch(uploadUrl, { method: 'POST', body });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? 'Não consegui enviar a imagem.');
      const { url } = await res.json();
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (e) { setUploadErr((e as Error).message); }
  };

  if (!editor) return null;

  return (
    <div className="rich-editor">
      {editable && (
        <div className="rich-toolbar" role="toolbar" aria-label="Formatação">
          <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)"><b>B</b></Btn>
          <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)"><i>I</i></Btn>
          <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Riscado"><s>S</s></Btn>
          <span className="rich-sep" />
          <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">H1</Btn>
          <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">H2</Btn>
          <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">H3</Btn>
          <span className="rich-sep" />
          <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista com marcadores">•</Btn>
          <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">1.</Btn>
          <Btn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Lista de tarefas">☑</Btn>
          <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citação">❝</Btn>
          <Btn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Bloco de código">{'</>'}</Btn>
          <span className="rich-sep" />
          <Btn active={editor.isActive('link')} onClick={() => setLinkPrompt(true)} title="Link">🔗</Btn>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ''; }} />
          <Btn onClick={() => fileInput.current?.click()} title="Inserir imagem">🖼</Btn>
          <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha divisória">―</Btn>
          <span className="rich-sep" />
          <Btn disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Desfazer">↺</Btn>
          <Btn disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Refazer">↻</Btn>
        </div>
      )}
      {uploadErr && <p className="error" role="alert">{uploadErr}</p>}
      <EditorContent editor={editor} className="rich-content" />
      {linkPrompt && (
        <TextPromptModal title="Link" label="Endereço do link" placeholder="https://…" submitLabel="Inserir"
          onSubmit={(url) => editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()}
          onClose={() => setLinkPrompt(false)} />
      )}
    </div>
  );
}
