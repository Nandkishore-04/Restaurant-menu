import { createApiClient } from "@qrmenu/api-client";
import { API_URL } from "./config";

export { ApiError, unwrap } from "@qrmenu/api-client";

export const api = createApiClient(API_URL);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
