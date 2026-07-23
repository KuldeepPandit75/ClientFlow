export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "clientflow_session";

export const REFRESH_COOKIE_NAME =
  process.env.REFRESH_COOKIE_NAME || `${SESSION_COOKIE_NAME}_refresh`;
