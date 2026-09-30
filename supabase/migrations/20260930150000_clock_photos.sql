-- Simbi: foto obrigatória no terminal PIN. Execute após o SQL de PIN e escalas.
-- Arquivo transacional e repetível. Registros antigos são preservados sem foto.
BEGIN;
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('clock-photos', 'clock-photos', false, 600000, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 600000, allowed_mime_types = ARRAY['image/jpeg'];

-- Even a broad policy on another bucket must not expose these photographs.
DROP POLICY IF EXISTS clock_photos_server_only ON storage.objects;
CREATE POLICY clock_photos_server_only ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated USING (bucket_id <> 'clock-photos') WITH CHECK (bucket_id <> 'clock-photos');

CREATE TABLE IF NOT EXISTS public.clock_photos (
  entry_id uuid PRIMARY KEY REFERENCES public.time_entries(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  object_path text NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL,
  event_type public.time_event_type NOT NULL
);
CREATE INDEX IF NOT EXISTS clock_photos_company_date ON public.clock_photos(company_id, recorded_at DESC, entry_id);
ALTER TABLE public.clock_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clock_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.clock_photos TO authenticated;
GRANT ALL ON public.clock_photos TO service_role;
DROP POLICY IF EXISTS company_admin_reads_clock_photos ON public.clock_photos;
CREATE POLICY company_admin_reads_clock_photos ON public.clock_photos FOR SELECT TO authenticated
USING (company_id = private.current_company_id() AND private.has_role(auth.uid(), 'admin'));

-- Allow time for the browser camera permission prompt and a retake.
ALTER TABLE private.clock_tickets ALTER COLUMN expires_at SET DEFAULT now() + interval '3 minutes';

CREATE OR REPLACE FUNCTION public.prepare_clock_photo(p_company uuid, p_ticket uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ticket private.clock_tickets; photo public.clock_photos;
BEGIN
  SELECT * INTO photo FROM public.clock_photos WHERE ticket_id = p_ticket AND company_id = p_company;
  IF photo.entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('eventType', photo.event_type, 'recordedAt', photo.recorded_at);
  END IF;
  SELECT * INTO ticket FROM private.clock_tickets WHERE id = p_ticket AND company_id = p_company;
  IF ticket.id IS NULL OR ticket.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'Confirmação expirada. Digite seu PIN novamente.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = ticket.user_id AND company_id = p_company)
    OR NOT private.has_role(ticket.user_id, 'employee') OR private.has_role(ticket.user_id, 'admin') THEN
    RETURN jsonb_build_object('error', 'Acesso indisponível. Consulte o responsável.');
  END IF;
  RETURN jsonb_build_object('path', p_company::text || '/' || p_ticket::text || '.jpg');
END;
$$;

-- Replace the old confirmation: there is no remaining PIN-only server path.
CREATE OR REPLACE FUNCTION public.confirm_clock_pin(p_company uuid, p_ticket uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ticket private.clock_tickets; last_entry public.time_entries; entry public.time_entries;
  photo public.clock_photos; next_event public.time_event_type; photo_path text;
BEGIN
  -- Retrying a lost response returns the same receipt, never an additional punch.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket::text, 1));
  SELECT * INTO photo FROM public.clock_photos WHERE ticket_id = p_ticket AND company_id = p_company;
  IF photo.entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('eventType', photo.event_type, 'recordedAt', photo.recorded_at);
  END IF;
  SELECT * INTO ticket FROM private.clock_tickets WHERE id = p_ticket AND company_id = p_company FOR UPDATE;
  IF ticket.id IS NULL OR ticket.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'Confirmação expirada. Digite seu PIN novamente.');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ticket.user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = ticket.user_id AND company_id = p_company)
    OR NOT private.has_role(ticket.user_id, 'employee') OR private.has_role(ticket.user_id, 'admin') THEN
    RETURN jsonb_build_object('error', 'Acesso indisponível. Consulte o responsável.');
  END IF;
  photo_path := p_company::text || '/' || p_ticket::text || '.jpg';
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'clock-photos' AND name = photo_path
    AND metadata->>'mimetype' = 'image/jpeg' AND (metadata->>'size')::bigint BETWEEN 1 AND 600000) THEN
    RETURN jsonb_build_object('error', 'Tire a foto antes de confirmar o ponto.');
  END IF;
  SELECT * INTO last_entry FROM public.time_entries WHERE user_id = ticket.user_id AND company_id = p_company ORDER BY recorded_at DESC, id DESC LIMIT 1;
  IF last_entry.recorded_at > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('error', 'Ponto já registrado há menos de um minuto.');
  END IF;
  next_event := CASE WHEN last_entry.event_type = 'clock_in' THEN 'clock_out' ELSE 'clock_in' END;
  IF next_event <> ticket.event_type THEN
    RETURN jsonb_build_object('error', 'Os registros mudaram. Digite o PIN novamente.');
  END IF;
  INSERT INTO public.time_entries(company_id, user_id, event_type) VALUES (p_company, ticket.user_id, next_event) RETURNING * INTO entry;
  INSERT INTO public.clock_photos(entry_id, ticket_id, company_id, user_id, object_path, recorded_at, event_type)
    VALUES (entry.id, ticket.id, p_company, ticket.user_id, photo_path, entry.recorded_at, entry.event_type);
  DELETE FROM private.clock_tickets WHERE id = ticket.id;
  RETURN jsonb_build_object('eventType', entry.event_type, 'recordedAt', entry.recorded_at);
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_clock_photo(uuid,uuid), public.confirm_clock_pin(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_clock_photo(uuid,uuid), public.confirm_clock_pin(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
