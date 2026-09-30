export function frontendOrigin(): string {
  return process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
}

export function myRegistrationUrl(accessToken: string): string {
  return `${frontendOrigin()}/my/${accessToken}`;
}
