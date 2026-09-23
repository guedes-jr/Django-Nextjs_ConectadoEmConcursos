import { http } from "@/lib/http";


export type NewsArticle = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  image_url: string;
  source_url: string;
  source: string;
  published_at: string | null;
};

export type NewsResult = {
  count: number;
  results: NewsArticle[];
  facets?: {
    categories: { category: string; count: number }[];
    total: number;
  } | null;
};

export type NewsFilters = {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  facets?: boolean;
};

export async function listNews(filters: NewsFilters = {}) {
  const response = await http.get<NewsResult>("/api/news/", {
    params: { ...filters, facets: filters.facets ? "1" : undefined },
  });
  return response.data;
}

export async function getNews(slug: string) {
  const response = await http.get<NewsArticle>(`/api/news/${slug}/`);
  return response.data;
}