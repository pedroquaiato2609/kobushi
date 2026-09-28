// Documentos: pastas, notas, listas e arquivos enviados ("minidatacenter" pessoal).
import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../domain/errors';
import type { Doc, DocListItem, Folder } from '../domain/entities';
import { paragraphsToHtml } from '../domain/richText';
import type { DocumentRepository, FolderRepository } from './ports';
import { sanitizeRichHtml } from './richText';
import type { DocCreateInput, DocUpdateInput } from './schemas';

export interface FileStore {
  save(name: string, data: Buffer): Promise<void>;
  remove(name: string): Promise<void>;
  path(name: string): string;
}
export type TextExtractor = (mime: string, filename: string, data: Buffer) => Promise<string>;

/** Ids da pasta e de todas as suas subpastas. */
export function descendantIds(folders: Folder[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) for (const f of folders) if (f.parentId === out[i]) out.push(f.id);
  return out;
}

export class DocumentService {
  constructor(
    private folders: FolderRepository, private docs: DocumentRepository, private files: FileStore, private extract: TextExtractor,
  ) {}

  // Pastas -------------------------------------------------------------------
  listFolders() { return this.folders.list(); }

  async createFolder(name: string, parentId: string | null | undefined, opts: { agent?: boolean } = {}) {
    if (parentId) await this.requireFolder(parentId, opts);
    return this.folders.create(name, parentId ?? null);
  }
  async renameFolder(id: string, name: string, opts: { agent?: boolean } = {}) {
    await this.requireFolder(id, opts);
    return (await this.folders.rename(id, name)) as Folder;
  }
  async setFolderAgentVisible(id: string, visible: boolean) {
    await this.requireFolder(id);
    return (await this.folders.setAgentVisible(id, visible)) as Folder;
  }
  async deleteFolder(id: string, opts: { agent?: boolean } = {}) {
    await this.requireFolder(id, opts);
    const ids = descendantIds(await this.folders.list(), id);
    for (const name of await this.docs.storageNamesIn(ids)) await this.files.remove(name).catch(() => undefined);
    await this.folders.delete(id);
  }

  // Documentos ---------------------------------------------------------------
  async list(opts: { folderId?: string; query?: string; limit?: number; agent?: boolean } = {}): Promise<DocListItem[]> {
    if (opts.agent && opts.folderId && opts.folderId !== 'root') await this.requireFolder(opts.folderId, { agent: true });
    const items = await this.docs.list({ folderId: opts.folderId, query: opts.query?.trim() || undefined, limit: opts.limit ?? 200 });
    if (!opts.agent) return items;
    const hidden = await this.hiddenFolderIds();
    return items.filter((d) => !d.folderId || !hidden.has(d.folderId));
  }

  async get(id: string, opts: { agent?: boolean } = {}): Promise<Doc> {
    const doc = await this.docs.get(id);
    if (!doc) throw new NotFoundError('Documento');
    if (opts.agent && doc.folderId && (await this.hiddenFolderIds()).has(doc.folderId)) throw new NotFoundError('Documento');
    return doc;
  }

  async create(input: DocCreateInput, opts: { agent?: boolean } = {}): Promise<Doc> {
    if (input.folderId) await this.requireFolder(input.folderId, opts);
    const content = input.kind === 'note' ? sanitizeRichHtml(input.content ?? '') : (input.content ?? '');
    return this.docs.create({ title: input.title, kind: input.kind, content, folderId: input.folderId ?? null });
  }

  // Notas (kind 'note') guardam HTML rico (o mesmo editor de Estudos); listas e arquivos continuam texto simples.
  async update(id: string, patch: DocUpdateInput, opts: { agent?: boolean } = {}): Promise<Doc> {
    const doc = await this.get(id, opts);
    const touchesContent = patch.content !== undefined || patch.appendContent !== undefined;
    if (doc.kind === 'file' && touchesContent) throw new ValidationError('O conteúdo de arquivos enviados não pode ser alterado; edite o título, o resumo ou a pasta.');
    if (patch.folderId) await this.requireFolder(patch.folderId, opts);

    let content: string | undefined;
    if (patch.content !== undefined) content = patch.content;
    if (patch.appendContent) {
      const base = content ?? doc.content;
      content = doc.kind === 'note'
        ? `${base}${paragraphsToHtml(patch.appendContent)}`
        : (base ? `${base.replace(/\n+$/, '')}\n${patch.appendContent}` : patch.appendContent);
    }
    if (doc.kind === 'note' && content !== undefined) content = sanitizeRichHtml(content);
    return (await this.docs.update(id, { title: patch.title, content, summary: patch.summary, folderId: patch.folderId })) as Doc;
  }

  async remove(id: string, opts: { agent?: boolean } = {}) {
    const doc = await this.get(id, opts);
    if (doc.storageName) await this.files.remove(doc.storageName).catch(() => undefined);
    await this.docs.delete(id);
  }

  async upload(input: { filename: string; mime: string; data: Buffer; folderId?: string | null }): Promise<Doc> {
    if (input.folderId) await this.requireFolder(input.folderId);
    const storageName = randomUUID();
    await this.files.save(storageName, input.data);
    let text = '';
    try { text = await this.extract(input.mime, input.filename, input.data); } catch { /* sem texto extraível */ }
    return this.docs.create({
      title: input.filename, kind: 'file', content: text.slice(0, 500_000), folderId: input.folderId ?? null,
      mime: input.mime, sizeBytes: input.data.length, storageName,
    });
  }

  async fileInfo(id: string) {
    const doc = await this.get(id);
    if (doc.kind !== 'file' || !doc.storageName) throw new NotFoundError('Arquivo');
    return { path: this.files.path(doc.storageName), mime: doc.mime ?? 'application/octet-stream', filename: doc.title };
  }

  // Internos -----------------------------------------------------------------
  /** Pastas ocultas do agente, incluindo todas as subpastas. */
  private async hiddenFolderIds(): Promise<Set<string>> {
    const all = await this.folders.list();
    const hidden = new Set<string>();
    for (const f of all.filter((x) => !x.agentVisible)) descendantIds(all, f.id).forEach((i) => hidden.add(i));
    return hidden;
  }

  private async requireFolder(id: string, opts: { agent?: boolean } = {}): Promise<Folder> {
    const folder = await this.folders.get(id);
    if (!folder || (opts.agent && (await this.hiddenFolderIds()).has(id))) throw new NotFoundError('Pasta');
    return folder;
  }
}
