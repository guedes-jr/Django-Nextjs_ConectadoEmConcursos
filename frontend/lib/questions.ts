import { http } from "@/lib/http";


export type Question = {
  id: number;
  discipline: string;
  banca: string;
  year: number;
  statement: string;
  options: string[];
  is_favorite: boolean;
  comment_count: number;
  latest_answer: number | null;
};

export type AnswerResult = {
  attempt_id: number;
  selected_answer: number;
  correct_answer: number;
  is_correct: boolean;
  explanation: string;
};

export type QuestionComment = {
  id: number;
  author: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
};

export type QuestionFilters = {
  search?: string;
  discipline?: string;
  banca?: string;
  year?: string;
  favorites?: boolean;
  exam?: number;
};

export async function listQuestions(filters: QuestionFilters = {}) {
  const response = await http.get<Question[]>("/api/questions/", { params: filters });
  return response.data;
}

export async function answerQuestion(questionId: number, selectedAnswer: number) {
  const response = await http.post<AnswerResult>(`/api/questions/${questionId}/answer/`, {
    selected_answer: selectedAnswer,
  });
  return response.data;
}

export async function toggleFavorite(questionId: number) {
  const response = await http.post<{ is_favorite: boolean }>(
    `/api/questions/${questionId}/favorite/`
  );
  return response.data;
}

export async function getNote(questionId: number) {
  const response = await http.get<{ content: string }>(`/api/questions/${questionId}/note/`);
  return response.data.content;
}

export async function saveNote(questionId: number, content: string) {
  const response = await http.put<{ content: string }>(`/api/questions/${questionId}/note/`, {
    content,
  });
  return response.data.content;
}

export async function listComments(questionId: number) {
  const response = await http.get<QuestionComment[]>(`/api/questions/${questionId}/comments/`);
  return response.data;
}

export async function createComment(questionId: number, content: string) {
  const response = await http.post<QuestionComment>(`/api/questions/${questionId}/comments/`, {
    content,
  });
  return response.data;
}

export async function deleteComment(commentId: number) {
  await http.delete(`/api/comments/${commentId}/`);
}

export async function reportQuestion(questionId: number, description: string) {
  await http.post(`/api/questions/${questionId}/report/`, { description });
}
