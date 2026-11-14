import { ApiError } from "./api";

// Translate backend failures into UI copy. Never display backend diagnostics.
export function actionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "The request could not finish. Please try again.";
  switch (error.status) {
    case 0: return "Cannot reach the server. Check your connection and try again.";
    case 400: return "Check the form details and try again.";
    case 401: return "Your session has ended. Sign in again.";
    case 403: return "You do not have permission for this action. Use an authorized admin account.";
    case 404: return "This account no longer exists. Refresh the list.";
    case 409: return "This username or email is already in use. Try another.";
    case 429: return "Too many attempts. Wait a moment and try again.";
    default: return "The server could not complete your request. Please try again shortly.";
  }
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && [400, 401].includes(error.status)) return "Wrong username or password.";
  return actionErrorMessage(error);
}
