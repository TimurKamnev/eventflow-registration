create extension if not exists pgcrypto;

create table if not exists organizers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  schedule_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  email text not null,
  status text not null check (status in ('confirmed', 'waitlisted', 'cancelled', 'checked_in')),
  access_token text not null unique,
  ticket_code text unique,
  seq bigserial,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- активная регистрация на email одна; отменённая освобождает email для новой
create unique index if not exists registrations_active_email_idx
  on registrations (event_id, lower(email))
  where status <> 'cancelled';

create index if not exists registrations_event_status_seq_idx
  on registrations (event_id, status, seq);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  registration_id uuid not null references registrations(id),
  type text not null check (type in ('waitlist', 'ticket', 'reminder', 'reschedule')),
  schedule_version integer not null,
  payload jsonb not null default '{}'::jsonb,
  dispatch_status text not null default 'pending' check (dispatch_status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (registration_id, type, schedule_version)
);

create index if not exists notifications_pending_idx
  on notifications (dispatch_status)
  where dispatch_status = 'pending';
