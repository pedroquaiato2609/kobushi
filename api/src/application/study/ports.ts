export type LinkedType = 'book' | 'workout' | 'activity';

export interface StudyFolder { id: string; name: string; createdAt: Date }

export interface StudyNote {
  id: string; title: string; content: string; linkedType: LinkedType | null; linkedId: string | null;
  folderId: string | null; pinned: boolean; tags: string[];
  archived: boolean; createdAt: Date; updatedAt: Date;
}
export interface StudyNoteInput {
  title: string; content: string; linkedType: LinkedType | null; linkedId: string | null;
  folderId: string | null; pinned: boolean; tags: string[];
}
/** Notas que citam esta (referências de volta) — só leitura, calculado a partir de study_note_links. */
export interface StudyNoteBacklink { id: string; title: string }

export interface Lesson { id: string; title: string; description: string; done: boolean }
export interface StudyPlan { id: string; subject: string; title: string; lessons: Lesson[]; archived: boolean; createdAt: Date; updatedAt: Date }
export interface StudyPlanInput { subject: string; title: string; lessons: Lesson[] }

export interface StudyRepository {
  saveImage(storage: string, mime: string): Promise<void>;
  imageMime(storage: string): Promise<string | null>;

  listFolders(): Promise<StudyFolder[]>;
  createFolder(name: string): Promise<StudyFolder>;
  renameFolder(id: string, name: string): Promise<StudyFolder | null>;
  deleteFolder(id: string): Promise<boolean>;

  listNotes(f: { linkedType?: LinkedType; linkedId?: string; folderId?: string; tag?: string; pinned?: boolean; query?: string; includeArchived?: boolean }): Promise<StudyNote[]>;
  getNote(id: string): Promise<StudyNote | null>;
  createNote(d: StudyNoteInput): Promise<StudyNote>;
  updateNote(id: string, patch: Partial<StudyNoteInput & { archived: boolean }>): Promise<StudyNote | null>;
  deleteNote(id: string): Promise<boolean>;

  /** Substitui todo o conjunto de notas para as quais esta nota aponta (relação nota-a-nota). */
  setNoteLinks(fromNote: string, toNotes: string[]): Promise<void>;
  linkedNoteIds(fromNote: string): Promise<string[]>;
  backlinks(toNote: string): Promise<StudyNoteBacklink[]>;
  allTags(): Promise<string[]>;

  listPlans(includeArchived?: boolean): Promise<StudyPlan[]>;
  getPlan(id: string): Promise<StudyPlan | null>;
  createPlan(d: StudyPlanInput): Promise<StudyPlan>;
  updatePlan(id: string, patch: Partial<StudyPlanInput & { archived: boolean }>): Promise<StudyPlan | null>;
  deletePlan(id: string): Promise<boolean>;
}
