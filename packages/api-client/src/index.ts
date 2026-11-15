import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type PublicMenu = Schemas["PublicMenuOut"];
export type Cart = Schemas["CartOut"];
export type Order = Schemas["OrderOut"];
export type OrderStatus = Schemas["OrderStatus"];

/**
 * Typed client for the FastAPI backend. Types are generated from its OpenAPI schema:
 *   pnpm api:types
 *
 * `getToken` returns a guest token (customer app) or a Supabase access token (dashboard).
 */
type TokenGetter = () => string | null | undefined | Promise<string | null | undefined>;

export function createApiClient(baseUrl: string, getToken?: TokenGetter) {
  const client = createClient<paths>({ baseUrl });
  client.use({
    async onRequest({ request }) {
      const token = await getToken?.();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Money is integer paise everywhere; format only at the edge. */
export function formatMoney(paise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(paise / 100);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Turn an openapi-fetch result into data, or throw ApiError carrying the server's message. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result;
  try {
    result = await call;
  } catch {
    throw new ApiError("Can't reach the server right now. Check your connection.", 0);
  }
  const { data, error, response } = result;
  if (error !== undefined || data === undefined) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(
      typeof detail === "string" ? detail : "Something went wrong. Please try again.",
      response.status,
    );
  }
  return data;
}
