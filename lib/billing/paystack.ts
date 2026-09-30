import crypto from "crypto";

// Paystack secret key must remain server-side
function getPaystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY not set");
  return secret;
}

function getPaystackPublicKey(): string {
  const pub = process.env.PAYSTACK_PUBLIC_KEY;
  if (!pub) throw new Error("PAYSTACK_PUBLIC_KEY not set");
  return pub;
}

export const PAYSTACK_API_BASE = "https://api.paystack.co";

export interface PaystackInitializePayload {
  email: string;
  amount: number; // in kobo
  plan?: string;
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
  currency?: string;
}

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: Record<string, unknown>;
    customer: {
      id: number;
      customer_code: string;
      email: string;
    };
    plan?: {
      plan_code: string;
      name: string;
    };
    subscription?: {
      subscription_code: string;
      email_token: string;
    };
  };
}

export interface PaystackCustomer {
  id: number;
  customer_code: string;
  email: string;
}

export async function paystackRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<T> {
  const secret = getPaystackSecret();
  const url = `${PAYSTACK_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    // Safe error - don't expose secret
    throw new Error(`Paystack request failed: ${res.status} ${text.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

export async function initializeTransaction(
  payload: PaystackInitializePayload
): Promise<PaystackInitializeResponse> {
  return paystackRequest<PaystackInitializeResponse>("/transaction/initialize", "POST", payload);
}

export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  return paystackRequest<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`, "GET");
}

export async function createCustomer(email: string, firstName?: string, lastName?: string) {
  return paystackRequest<{ status: boolean; data: PaystackCustomer }>("/customer", "POST", {
    email,
    first_name: firstName,
    last_name: lastName,
  });
}

export async function listPlans() {
  return paystackRequest<{ status: boolean; data: unknown[] }>("/plan", "GET");
}

export async function createPlan(name: string, amount: number, interval: string, description?: string) {
  return paystackRequest("/plan", "POST", {
    name,
    amount,
    interval,
    description,
  });
}

export function verifyPaystackWebhookSignature(payload: string, signature: string): boolean {
  const secret = getPaystackSecret();
  const hash = crypto.createHmac("sha512", secret).update(payload).digest("hex");
  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    // If lengths differ, timingSafeEqual throws
    return false;
  }
}

export function getPaystackPublicKeyForClient(): string {
  // Public key may be used client-side where Paystack requires it
  // Still sourced from env/config, not hardcoded
  return getPaystackPublicKey();
}

// Server-side check for plan access
export function canAccessFeature(plan: string, feature: string): boolean {
  const PLAN_FEATURES: Record<string, string[]> = {
    free: ["connect_1_account", "sync_3_per_month", "basic_support"],
    starter: ["connect_3_accounts", "sync_50_per_month", "standard_support", "preserve_order"],
    pro: [
      "connect_unlimited",
      "sync_unlimited",
      "priority_support",
      "preserve_order",
      "preserve_duplicates",
      "advanced_matching",
    ],
    enterprise: [
      "connect_unlimited",
      "sync_unlimited",
      "priority_support",
      "preserve_order",
      "preserve_duplicates",
      "advanced_matching",
      "team_access",
      "api_access",
    ],
  };

  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
}

export function getPlanLimits(plan: string) {
  const LIMITS: Record<string, { maxConnectedAccounts: number; maxSyncsPerMonth: number }> = {
    free: { maxConnectedAccounts: 1, maxSyncsPerMonth: 3 },
    starter: { maxConnectedAccounts: 3, maxSyncsPerMonth: 50 },
    pro: { maxConnectedAccounts: -1, maxSyncsPerMonth: -1 }, // unlimited
    enterprise: { maxConnectedAccounts: -1, maxSyncsPerMonth: -1 },
  };
  return LIMITS[plan] ?? LIMITS.free;
}
