import { http } from "@/lib/http";

export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; provider: string; created_at: string };
export type Conversation = { id: number; title: string; created_at: string; updated_at: string; messages: ChatMessage[] };

export async function listConversations() { return (await http.get<Conversation[]>("/api/conversations/")).data; }
export async function createConversation() { return (await http.post<Conversation>("/api/conversations/", {})).data; }
export async function deleteConversation(id: number) { await http.delete(`/api/conversations/${id}/`); }
export async function sendMessage(id: number, content: string, context: { question_ids?: number[]; exam_id?: number } = {}) {
  return (await http.post<{ user_message: ChatMessage; assistant_message: ChatMessage }>(`/api/conversations/${id}/send/`, { content, ...context })).data;
}
