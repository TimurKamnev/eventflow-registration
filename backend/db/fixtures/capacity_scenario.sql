-- Воспроизводимые тестовые данные для проверки правила:
-- "нельзя уменьшить capacity ниже уже занятых мест" (confirmed + checked_in).
--
-- Registration API появится в этапе 3, поэтому регистрации здесь создаются
-- напрямую в БД. Событие с фиксированным id, чтобы сценарий можно было повторно
-- запускать и сразу знать id для последующего PATCH.
--
-- Запуск:
--   docker exec -i eventflow-db-1 psql -U eventflow -d eventflow \
--     < backend/db/fixtures/capacity_scenario.sql
--
-- Ожидаемое состояние после запуска: capacity=5, occupied (confirmed+checked_in)=2,
-- ещё один участник в waitlisted (в подсчёт occupied не входит).

insert into events (id, title, description, starts_at, capacity)
values (
  '00000000-0000-0000-0000-000000000001',
  'Тестовое событие: capacity guard',
  'Фикстура для проверки этапа 2, не для продакшена',
  now() + interval '30 days',
  5
)
on conflict (id) do nothing;

-- ticket_code уникален глобально (across всех событий), поэтому не хардкодим
-- литералы вроде 'TICKET-A' — на базе с другими тестовыми данными такой
-- литерал может уже существовать, и ON CONFLICT DO NOTHING тихо пропустит
-- именно эту строку, не вставив нужную для сценария регистрацию.
insert into registrations (event_id, email, status, access_token, ticket_code)
values
  ('00000000-0000-0000-0000-000000000001', 'capacity-fixture-a@example.com', 'confirmed', encode(gen_random_bytes(24), 'hex'), 'TICKET-' || upper(encode(gen_random_bytes(4), 'hex'))),
  ('00000000-0000-0000-0000-000000000001', 'capacity-fixture-b@example.com', 'checked_in', encode(gen_random_bytes(24), 'hex'), 'TICKET-' || upper(encode(gen_random_bytes(4), 'hex'))),
  ('00000000-0000-0000-0000-000000000001', 'capacity-fixture-c@example.com', 'waitlisted', encode(gen_random_bytes(24), 'hex'), null)
on conflict do nothing;
