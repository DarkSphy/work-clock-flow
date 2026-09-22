CREATE TYPE public.app_role AS ENUM ('admin', 'employee');
CREATE TYPE public.time_event_type AS ENUM ('clock_in', 'clock_out');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  workday_minutes integer NOT NULL DEFAULT 480 CHECK (workday_minutes BETWEEN 60 AND 960),
  work_start time NOT NULL DEFAULT '08:00',
  work_end time NOT NULL DEFAULT '17:00',
  break_minutes integer NOT NULL DEFAULT 60 CHECK (break_minutes BETWEEN 0 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type public.time_event_type NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

CREATE POLICY "company_members_read_company" ON public.companies FOR SELECT TO authenticated USING (id = public.current_company_id() OR owner_id = auth.uid());
CREATE POLICY "owners_update_company" ON public.companies FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "users_read_own_or_admin_company_profiles" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_read_own_role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_or_admin_company_entries" ON public.time_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "users_create_own_entries" ON public.time_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND company_id = public.current_company_id());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.onboard_company(_company_name text, _full_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_id uuid := auth.uid();
  _company_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND company_id IS NOT NULL) THEN RAISE EXCEPTION 'User already belongs to a company'; END IF;
  INSERT INTO public.companies (owner_id, name) VALUES (_user_id, trim(_company_name)) RETURNING id INTO _company_id;
  UPDATE public.profiles SET company_id = _company_id, full_name = trim(_full_name) WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin');
  RETURN _company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.onboard_company(text, text) TO authenticated;

CREATE INDEX time_entries_user_recorded_idx ON public.time_entries (user_id, recorded_at DESC);
CREATE INDEX profiles_company_idx ON public.profiles (company_id);