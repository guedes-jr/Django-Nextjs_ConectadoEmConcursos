import { http } from "@/lib/http";

export type Sketch = {
  id: number;
  title: string;
  data: any;
  created_at: string;
  updated_at: string;
};

export async function listSketches(): Promise<Sketch[]> {
  const res = await http.get("/api/sketches/recent/");
  return res.data;
}

export async function getSketch(id: number): Promise<Sketch> {
  const res = await http.get(`/api/sketches/${id}/`);
  return res.data;
}

export async function createSketch(title: string, data: any): Promise<Sketch> {
  const res = await http.post("/api/sketches/", { title, data });
  return res.data;
}

export async function updateSketch(id: number, payload: Partial<Pick<Sketch, "title" | "data">>): Promise<Sketch> {
  const res = await http.patch(`/api/sketches/${id}/`, payload);
  return res.data;
}

export async function deleteSketch(id: number): Promise<void> {
  await http.delete(`/api/sketches/${id}/`);
}
