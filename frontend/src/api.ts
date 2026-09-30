const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
  schedule_version: number;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
  remaining: number;
  isFull: boolean;
}

export interface MyRegistration {
  event: { title: string; description: string; starts_at: string };
  status: "confirmed" | "waitlisted" | "cancelled" | "checked_in";
  ticket_code: string | null;
  waitlist_position: number | null;
  checked_in_at: string | null;
}

export interface EventNotification {
  id: string;
  type: "waitlist" | "ticket" | "reminder" | "reschedule";
  schedule_version: number;
  payload: {
    event_title: string;
    starts_at: string;
    ticket_code: string | null;
    my_registration_url: string;
  };
  dispatch_status: string;
  created_at: string;
  sent_at: string | null;
  registration_email: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ email: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  listEvents: () => request<{ events: EventRecord[] }>("/api/events"),
  createEvent: (data: Pick<EventRecord, "title" | "description" | "starts_at" | "capacity">) =>
    request<{ event: EventRecord }>("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEvent: (id: string, data: Partial<Pick<EventRecord, "title" | "description" | "starts_at" | "capacity">>) =>
    request<{ event: EventRecord }>(`/api/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  eventNotifications: (id: string) =>
    request<{ notifications: EventNotification[] }>(`/api/events/${id}/notifications`),

  publicEvent: (id: string) => request<{ event: PublicEvent }>(`/api/events/${id}/public`),
  register: (id: string, email: string) =>
    request<{ message: string }>(`/api/events/${id}/registrations`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  myRegistration: (token: string) => request<MyRegistration>(`/api/my/${token}`),
  cancelMyRegistration: (token: string) =>
    request<{ status: string }>(`/api/my/${token}/cancel`, { method: "POST" }),
};
