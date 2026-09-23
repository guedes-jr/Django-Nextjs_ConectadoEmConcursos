import { http } from "@/lib/http";

export type Notebook = {
  id: number;
  title: string;
  question_ids: number[];
  created_at: string;
};

export async function listNotebooks() {
  const response = await http.get<Notebook[]>("/api/workspace/notebooks/");
  return response.data;
}

export async function createNotebook(title: string) {
  const response = await http.post<Notebook>("/api/workspace/notebooks/", { title });
  return response.data;
}

export async function renameNotebook(id: number, title: string) {
  const response = await http.patch<Notebook>(`/api/workspace/notebooks/${id}/`, { title });
  return response.data;
}

export async function deleteNotebook(id: number) {
  await http.delete(`/api/workspace/notebooks/${id}/`);
}

export async function addNotebookQuestion(id: number, questionId: number) {
  const response = await http.post<Notebook>(`/api/workspace/notebooks/${id}/questions/`, {
    question_id: questionId,
  });
  return response.data;
}

export async function removeNotebookQuestion(id: number, questionId: number) {
  const response = await http.delete<Notebook>(`/api/workspace/notebooks/${id}/questions/`, {
    data: { question_id: questionId },
  });
  return response.data;
}

export type Flashcard = {
  id: number;
  discipline: string;
  front: string;
  back: string;
  next_review_at: string | null;
  interval_days: number;
};

export async function listFlashcards() {
  const response = await http.get<Flashcard[]>("/api/workspace/flashcards/");
  return response.data;
}

export async function createFlashcard(data: { front: string; back: string; discipline?: string }) {
  const response = await http.post<Flashcard>("/api/workspace/flashcards/", data);
  return response.data;
}

export async function updateFlashcard(id: number, data: Partial<Pick<Flashcard, "front" | "back" | "discipline">>) {
  const response = await http.patch<Flashcard>(`/api/workspace/flashcards/${id}/`, data);
  return response.data;
}

export async function reviewFlashcard(id: number, correct: boolean) {
  const response = await http.patch<Flashcard>(`/api/workspace/flashcards/${id}/`, { correct });
  return response.data;
}

export async function deleteFlashcard(id: number) {
  await http.delete(`/api/workspace/flashcards/${id}/`);
}

export type Note = {
  question_id: number;
  discipline: string;
  content: string;
  updated_at: string;
};

export async function listNotes() {
  const response = await http.get<Note[]>("/api/workspace/notes/");
  return response.data;
}
export type CommunityPost = {
  id: number;
  kind: "forum" | "feed";
  title: string;
  content: string;
  parent_id: number | null;
  author: string;
  created_at: string;
  replies: number;
  is_owner: boolean;
};

export async function listCommunity(kind: "forum" | "feed", parent?: number) {
  const response = await http.get<CommunityPost[]>("/api/workspace/community/", {
    params: { kind, parent: parent ?? undefined },
  });
  return response.data;
}

export async function createCommunityPost(data: {
  kind: "forum" | "feed";
  title?: string;
  content: string;
  parent_id?: number;
}) {
  const response = await http.post<CommunityPost>("/api/workspace/community/", data);
  return response.data;
}

export async function deleteCommunityPost(id: number) {
  await http.delete(`/api/workspace/community/${id}/`);
}

export type Person = {
  id: number;
  username: string;
  name: string;
};

export async function listPeople(search = "") {
  const response = await http.get<Person[]>("/api/workspace/people/", {
    params: { search: search || undefined },
  });
  return response.data;
}

export type RankingEntry = {
  position: number;
  username: string;
  correct: number;
  total: number;
};

export async function listRanking() {
  const response = await http.get<RankingEntry[]>("/api/workspace/ranking/");
  return response.data;
}

export type ExamSubmissionItem = {
  id: number;
  title: string;
  source_url: string;
  status: "pending" | "reviewed";
  created_at: string;
};

export async function listSubmissions() {
  const response = await http.get<ExamSubmissionItem[]>("/api/workspace/submissions/");
  return response.data;
}

export async function createSubmission(data: { title: string; source_url: string; description?: string }) {
  const response = await http.post<{ id: number; status: string }>("/api/workspace/submissions/", data);
  return response.data;
}
