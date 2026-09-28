import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Activity, Book, GymWorkout, LinkedType, StudyFolder, StudyNote } from '../../api/types';
import type { StudyPlan } from '../../api/types';

export interface StudyNoteFilter { linkedType?: LinkedType; linkedId?: string; folderId?: string; tag?: string; pinned?: boolean; query?: string }

export const useStudyNotes = (f: StudyNoteFilter = {}) => useQuery({
  queryKey: ['study', 'notes', f.linkedType ?? 'all', f.linkedId ?? 'all', f.folderId ?? 'all', f.tag ?? 'all', f.pinned ?? false, f.query ?? ''],
  queryFn: () => api.get<StudyNote[]>(`/study/notes?${new URLSearchParams({
    ...(f.linkedType ? { linkedType: f.linkedType } : {}), ...(f.linkedId ? { linkedId: f.linkedId } : {}),
    ...(f.folderId ? { folderId: f.folderId } : {}), ...(f.tag ? { tag: f.tag } : {}),
    ...(f.pinned ? { pinned: 'true' } : {}), ...(f.query ? { query: f.query } : {}),
  })}`),
});
export const useStudyPlans = () => useQuery({ queryKey: ['study', 'plans'], queryFn: () => api.get<StudyPlan[]>('/study/plans') });
export const useStudyFolders = () => useQuery({ queryKey: ['study', 'folders'], queryFn: () => api.get<StudyFolder[]>('/study/folders') });
export const useStudyTags = () => useQuery({ queryKey: ['study', 'tags'], queryFn: () => api.get<string[]>('/study/tags') });

// pro seletor de vínculo (livro / treino / atividade)
export const useBooksForLink = () => useQuery({ queryKey: ['reading', 'books', 'all'], queryFn: () => api.get<Book[]>('/reading/books') });
export const useWorkoutsForLink = () => useQuery({ queryKey: ['gym', 'workouts'], queryFn: () => api.get<GymWorkout[]>('/gym/workouts') });
export const useActivitiesForLink = () => useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

export const LINKED_LABEL: Record<LinkedType, string> = { book: 'Livro', workout: 'Treino', activity: 'Atividade' };
