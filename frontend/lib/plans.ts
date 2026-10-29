import { http } from "@/lib/http";
import { BillingCycle } from "@/types/plans";

export type ApiPlan = { id: number; slug: string; name: string; prices: Record<BillingCycle, string | number>; features: string[]; capabilities: { questions_daily: number | null; chat_daily: number; ai_provider: boolean; advanced_tools: boolean } };
export type Subscription = { id: number; plan: ApiPlan; cycle: BillingCycle; status: "active" | "pending_payment" | "canceled"; gateway: "local" | "stripe"; provider_status: string; current_period_end: string | null; cancel_at_period_end: boolean; access_active: boolean; created_at: string; updated_at: string; activated_at: string | null };
export async function listPlans() { return (await http.get<ApiPlan[]>("/api/plans/")).data; }
export async function getSubscription() { return (await http.get<Subscription | null>("/api/subscription/")).data || null; }
export async function selectPlan(plan: string, cycle: BillingCycle) { return (await http.post<{ subscription: Subscription | null; checkout_required: boolean; checkout_url: string | null; checkout_status: string | null; detail: string | null }>("/api/subscription/", { plan, cycle })).data; }

export async function cancelSubscription() { return (await http.post<Subscription>("/api/subscription/cancel/")).data; }
export async function expireCheckout() { return (await http.post<{ detail: string }>("/api/subscription/checkout/expire/")).data; }
