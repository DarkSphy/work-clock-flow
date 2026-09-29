-- Simbi: PIN individual, terminal compartilhado e escala semanal.
-- Execute o arquivo completo no banco deste projeto antes de publicar as novas telas.
-- Pode ser executado novamente; os PINs e registros existentes são preservados.
BEGIN;
-- PINs and short-lived clock tickets are never readable through the public API.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_schedule jsonb, ADD COLUMN IF NOT EXISTS employment_start date;
UPDATE public.profiles SET employment_start = (created_at AT TIME ZONE 'America/Sao_Paulo')::date WHERE employment_start IS NULL;
ALTER TABLE public.profiles ALTER COLUMN employment_start SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  ALTER COLUMN employment_start SET NOT NULL;
-- An employee must not change the company or the schedule used to calculate balances.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
CREATE TABLE IF NOT EXISTS private.clock_secret (id boolean PRIMARY KEY DEFAULT true CHECK (id), secret text NOT NULL);
INSERT INTO private.clock_secret VALUES (true, gen_random_uuid()::text || gen_random_uuid()::text) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS private.employee_pins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  digest text NOT NULL,
  UNIQUE (company_id, digest)
);
CREATE TABLE IF NOT EXISTS private.clock_attempts (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(), failures integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS private.clock_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  event_type public.time_event_type NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds'
);
REVOKE ALL ON private.clock_secret, private.employee_pins, private.clock_attempts, private.clock_tickets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.pin_digest(company uuid, pin text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(secret || company::text || pin, 'UTF8')), 'hex') FROM private.clock_secret WHERE id
$$;
REVOKE ALL ON FUNCTION private.pin_digest(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.employee_pin_available(p_company uuid, p_pin text, p_user uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_pin ~ '^[0-9]{4}$' AND NOT EXISTS (
    SELECT 1 FROM private.employee_pins WHERE company_id = p_company
      AND digest = private.pin_digest(p_company, p_pin) AND user_id IS DISTINCT FROM p_user
  )
$$;
CREATE OR REPLACE FUNCTION public.set_employee_pin(p_company uuid, p_user uuid, p_pin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'O PIN deve ter exatamente 4 dígitos.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user AND company_id = p_company)
    OR NOT private.has_role(p_user, 'employee') OR private.has_role(p_user, 'admin') THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta empresa.';
  END IF;
  INSERT INTO private.employee_pins(user_id, company_id, digest)
    VALUES (p_user, p_company, private.pin_digest(p_company, p_pin))
    ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id, digest = EXCLUDED.digest;
  DELETE FROM private.clock_tickets WHERE user_id = p_user;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Este PIN já está em uso nesta empresa. Escolha outro.';
END;
$$;

CREATE OR REPLACE FUNCTION public.identify_clock_pin(p_company uuid, p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE worker public.profiles; attempt private.clock_attempts; last_event public.time_event_type; ticket uuid; next_event public.time_event_type;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN
    RETURN jsonb_build_object('error', 'PIN não encontrado nesta empresa.');
  END IF;
  INSERT INTO private.clock_attempts(company_id) VALUES (p_company) ON CONFLICT DO NOTHING;
  SELECT * INTO attempt FROM private.clock_attempts WHERE company_id = p_company FOR UPDATE;
  IF attempt.started_at < now() - interval '5 minutes' THEN
    UPDATE private.clock_attempts SET failures = 0, started_at = now() WHERE company_id = p_company;
    attempt.failures := 0;
  END IF;
  IF attempt.failures >= 10 THEN RETURN jsonb_build_object('error', 'Muitas tentativas incorretas. Aguarde até 5 minutos e tente novamente.'); END IF;
  SELECT p.* INTO worker FROM public.profiles p JOIN private.employee_pins k ON k.user_id = p.user_id
    WHERE k.company_id = p_company AND p.company_id = p_company AND k.digest = private.pin_digest(p_company, p_pin)
      AND private.has_role(p.user_id, 'employee') AND NOT private.has_role(p.user_id, 'admin');
  IF worker.user_id IS NULL THEN
    UPDATE private.clock_attempts SET failures = failures + 1 WHERE company_id = p_company;
    RETURN jsonb_build_object('error', 'PIN não encontrado nesta empresa.');
  END IF;
  SELECT event_type INTO last_event FROM public.time_entries WHERE user_id = worker.user_id AND company_id = p_company ORDER BY recorded_at DESC, id DESC LIMIT 1;
  next_event := CASE WHEN last_event = 'clock_in' THEN 'clock_out' ELSE 'clock_in' END;
  DELETE FROM private.clock_tickets WHERE expires_at < now() OR user_id = worker.user_id;
  INSERT INTO private.clock_tickets(company_id, user_id, event_type) VALUES (p_company, worker.user_id, next_event) RETURNING id INTO ticket;
  RETURN jsonb_build_object('name', worker.full_name, 'eventType', next_event, 'ticket', ticket);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_clock_pin(p_company uuid, p_ticket uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ticket private.clock_tickets; last_entry public.time_entries; entry public.time_entries; next_event public.time_event_type;
BEGIN
  SELECT * INTO ticket FROM private.clock_tickets WHERE id = p_ticket AND company_id = p_company FOR UPDATE;
  IF ticket.id IS NULL OR ticket.expires_at < now() THEN RETURN jsonb_build_object('error', 'Confirmação expirada. Digite seu PIN novamente.'); END IF;
  -- Serializes confirmations for this employee, even from two different terminals.
  PERFORM pg_advisory_xact_lock(hashtextextended(ticket.user_id::text, 0));
  DELETE FROM private.clock_tickets WHERE id = ticket.id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = ticket.user_id AND company_id = p_company)
    OR NOT private.has_role(ticket.user_id, 'employee') OR private.has_role(ticket.user_id, 'admin') THEN
    RETURN jsonb_build_object('error', 'Acesso indisponível. Consulte o responsável.');
  END IF;
  SELECT * INTO last_entry FROM public.time_entries WHERE user_id = ticket.user_id AND company_id = p_company ORDER BY recorded_at DESC, id DESC LIMIT 1;
  IF last_entry.recorded_at > now() - interval '60 seconds' THEN RETURN jsonb_build_object('error', 'Ponto já registrado há menos de um minuto.'); END IF;
  next_event := CASE WHEN last_entry.event_type = 'clock_in' THEN 'clock_out' ELSE 'clock_in' END;
  IF next_event <> ticket.event_type THEN RETURN jsonb_build_object('error', 'Os registros mudaram. Digite o PIN novamente.'); END IF;
  INSERT INTO public.time_entries(company_id, user_id, event_type) VALUES (p_company, ticket.user_id, next_event) RETURNING * INTO entry;
  RETURN jsonb_build_object('eventType', entry.event_type, 'recordedAt', entry.recorded_at);
END;
$$;

REVOKE ALL ON FUNCTION public.employee_pin_available(uuid,text,uuid), public.set_employee_pin(uuid,uuid,text), public.identify_clock_pin(uuid,text), public.confirm_clock_pin(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_pin_available(uuid,text,uuid), public.set_employee_pin(uuid,uuid,text), public.identify_clock_pin(uuid,text), public.confirm_clock_pin(uuid,uuid) TO service_role;
-- Dashboard credentials can read time entries; only the server clock may create them.
DROP POLICY IF EXISTS employees_create_own_entries ON public.time_entries;
DROP POLICY IF EXISTS users_create_own_entries ON public.time_entries;

CREATE OR REPLACE FUNCTION public.employee_pin_status(p_company uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT user_id FROM private.employee_pins WHERE company_id = p_company
$$;
REVOKE ALL ON FUNCTION public.employee_pin_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_pin_status(uuid) TO service_role;

COMMIT;
