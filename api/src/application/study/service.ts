import type { z } from 'zod';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { planProgress } from '../../domain/study';
import type { FileStore } from '../library';
import { sanitizeRichHtml } from '../richText';
import type { Lesson, LinkedType, StudyFolder, StudyNote, StudyNoteBacklink, StudyPlan, StudyRepository } from './ports';
import type { folderCreateSchema, lessonSchema, noteCreateSchema, noteUpdateSchema, planCreateSchema, planUpdateSchema } from './schemas';

const dedupeSelf = (selfId: string, ids: string[]) => [...new Set(ids.filter((i) => i !== selfId))];

/** @deprecated use sanitizeRichHtml de '../richText' — mantido aqui só pra não quebrar quem ainda importa daqui. */
export const sanitizeNoteHtml = sanitizeRichHtml;

export interface StudyPlanView extends StudyPlan { progressPct: number }
export interface StudyNoteView extends StudyNote { linkedNoteIds: string[]; backlinks: StudyNoteBacklink[] }

export class StudyService {
  constructor(private repo: StudyRepository, private files: FileStore) {}

  // ---- pastas ------------------------------------------------------------------------
  listFolders() { return this.repo.listFolders(); }
  async createFolder(input: z.output<typeof folderCreateSchema>): Promise<StudyFolder> { return this.repo.createFolder(input.name); }
  async renameFolder(id: string, input: z.output<typeof folderCreateSchema>): Promise<StudyFolder> {
    const f = await this.repo.renameFolder(id, input.name);
    if (!f) throw new NotFoundError('Pasta');
    return f;
  }
  async removeFolder(id: string) { if (!(await this.repo.deleteFolder(id))) throw new NotFoundError('Pasta'); }
  allTags() { return this.repo.allTags(); }

  // ---- notas -----------------------------------------------------------------------
  listNotes(f: { linkedType?: LinkedType; linkedId?: string; folderId?: string; tag?: string; pinned?: boolean; query?: string } = {}) {
    return this.repo.listNotes(f);
  }
  private async noteView(n: StudyNote): Promise<StudyNoteView> {
    const [linkedNoteIds, backlinks] = await Promise.all([this.repo.linkedNoteIds(n.id), this.repo.backlinks(n.id)]);
    return { ...n, linkedNoteIds, backlinks };
  }
  async getNote(id: string): Promise<StudyNoteView> {
    const n = await this.repo.getNote(id);
    if (!n) throw new NotFoundError('Nota');
    return this.noteView(n);
  }

  private checkLink(linkedType?: LinkedType | null, linkedId?: string | null) {
    if (Boolean(linkedType) !== Boolean(linkedId)) throw new ValidationError('Informe o tipo e o id do vínculo juntos (ou nenhum dos dois).');
  }

  async createNote(input: z.output<typeof noteCreateSchema>): Promise<StudyNoteView> {
    this.checkLink(input.linkedType, input.linkedId);
    const note = await this.repo.createNote({
      title: input.title, content: sanitizeNoteHtml(input.content ?? ''),
      linkedType: input.linkedType ?? null, linkedId: input.linkedId ?? null,
      folderId: input.folderId ?? null, pinned: input.pinned ?? false, tags: input.tags ?? [],
    });
    if (input.linkedNoteIds) await this.repo.setNoteLinks(note.id, dedupeSelf(note.id, input.linkedNoteIds));
    return this.noteView(note);
  }
  async updateNote(id: string, patch: z.output<typeof noteUpdateSchema>): Promise<StudyNoteView> {
    const cur = await this.repo.getNote(id);
    if (!cur) throw new NotFoundError('Nota');
    if (patch.linkedType !== undefined || patch.linkedId !== undefined) {
      this.checkLink(patch.linkedType !== undefined ? patch.linkedType : cur.linkedType, patch.linkedId !== undefined ? patch.linkedId : cur.linkedId);
    }
    const { linkedNoteIds, ...rest } = patch;
    const row = await this.repo.updateNote(id, { ...rest, ...(patch.content !== undefined ? { content: sanitizeNoteHtml(patch.content) } : {}) });
    if (linkedNoteIds !== undefined) await this.repo.setNoteLinks(id, dedupeSelf(id, linkedNoteIds));
    return this.noteView(row as StudyNote);
  }
  async removeNote(id: string) { if (!(await this.repo.deleteNote(id))) throw new NotFoundError('Nota'); }

  // ---- imagem embutida na nota (upload direto do editor) ----------------------------
  private readonly IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']);
  async uploadImage(data: Buffer, mime: string): Promise<{ url: string }> {
    if (!this.IMAGE_TYPES.has(mime)) throw new ValidationError('Envie uma imagem PNG, JPEG, WebP, AVIF ou GIF.');
    if (data.length === 0 || data.length > 8 * 1024 * 1024) throw new ValidationError('A imagem precisa ter até 8 MB.');
    const storage = crypto.randomUUID();
    await this.files.save(storage, data);
    await this.repo.saveImage(storage, mime);
    return { url: `/api/study/images/${storage}` };
  }
  async imageInfo(storage: string) {
    const mime = await this.repo.imageMime(storage);
    if (!mime) throw new NotFoundError('Imagem');
    return { path: this.files.path(storage), mime };
  }

  // ---- planos de estudo ----------------------------------------------------------------
  private view(p: StudyPlan): StudyPlanView { return { ...p, progressPct: planProgress(p.lessons) }; }
  async listPlans(): Promise<StudyPlanView[]> { return (await this.repo.listPlans()).map((p) => this.view(p)); }
  async getPlan(id: string): Promise<StudyPlanView> { const p = await this.repo.getPlan(id); if (!p) throw new NotFoundError('Plano de estudo'); return this.view(p); }

  private normalizeLessons(lessons: z.output<typeof lessonSchema>[]): Lesson[] {
    return lessons.map((l) => ({ id: l.id, title: l.title, description: l.description ?? '', done: l.done ?? false }));
  }
  async createPlan(input: z.output<typeof planCreateSchema>): Promise<StudyPlanView> {
    const p = await this.repo.createPlan({ subject: input.subject, title: input.title, lessons: this.normalizeLessons(input.lessons) });
    return this.view(p);
  }
  async updatePlan(id: string, patch: z.output<typeof planUpdateSchema>): Promise<StudyPlanView> {
    await this.getPlan(id);
    const { lessons: rawLessons, ...rest } = patch;
    const lessons = rawLessons ? this.normalizeLessons(rawLessons) : undefined;
    const row = await this.repo.updatePlan(id, { ...rest, ...(lessons ? { lessons } : {}) });
    return this.view(row as StudyPlan);
  }
  /** Marca (ou desmarca) uma aula específica — usado tanto pela tela quanto pelo assistente, sem reenviar o plano inteiro. */
  async setLessonDone(planId: string, lessonId: string, done: boolean): Promise<StudyPlanView> {
    const cur = await this.getPlan(planId);
    const lesson = cur.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new NotFoundError('Aula');
    const lessons = cur.lessons.map((l) => (l.id === lessonId ? { ...l, done } : l));
    const row = await this.repo.updatePlan(planId, { lessons });
    return this.view(row as StudyPlan);
  }
  async removePlan(id: string) { if (!(await this.repo.deletePlan(id))) throw new NotFoundError('Plano de estudo'); }
}
