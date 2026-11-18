import { createApiClient } from "@qrmenu/api-client";
import { getAccessToken } from "./auth";
import { API_URL } from "./config";

export { ApiError, unwrap } from "@qrmenu/api-client";

// Staff calls carry the Supabase access token;
// the API verifies it and checks restaurant membership.
export const api = createApiClient(API_URL, getAccessToken);
