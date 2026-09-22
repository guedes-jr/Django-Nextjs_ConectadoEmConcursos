import { http } from "@/lib/http";
import { BillingCycle } from "@/types/plans";

export type ApiPlan = { id: number; slug: "gratis" | "padrao" | "avancado"; name: string; prices: Record<BillingCycle, string>; features: string[]; capabilities: { questions_daily: number | null; chat_daily: number; ai_provider: boolean; advanced_tools: boolean } };
export type Subscription = { id: number; plan: ApiPlan; cycle: BillingCycle; status: "active" | "pending_payment" | "canceled" };
export async function listPlans() { return (await http.get<ApiPlan[]>("/api/plans/")).data; }
export async function getSubscription() { return (await http.get<Subscription | null>("/api/subscription/")).data; }
export async function selectPlan(plan: string, cycle: BillingCycle) { return (await http.post<{ subscription: Subscription; checkout_required: boolean; detail: string | null }>("/api/subscription/", { plan, cycle })).data; }
