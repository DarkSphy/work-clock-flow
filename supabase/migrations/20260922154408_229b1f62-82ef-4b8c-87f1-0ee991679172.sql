CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

DROP FUNCTION IF EXISTS public.onboard_company(text, text);

ALTER FUNCTION public.update_updated_at_column() SET SCHEMA private;
ALTER FUNCTION public.handle_new_user() SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.current_company_id() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_company_id() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_company_id() TO authenticated;

DROP POLICY "company_members_read_company" ON public.companies;
DROP POLICY "owners_update_company" ON public.companies;
DROP POLICY "users_read_own_or_admin_company_profiles" ON public.profiles;
DROP POLICY "users_read_own_or_admin_company_entries" ON public.time_entries;
DROP POLICY "users_create_own_entries" ON public.time_entries;

CREATE POLICY "company_members_read_company" ON public.companies FOR SELECT TO authenticated USING (id = private.current_company_id() OR owner_id = auth.uid());
CREATE POLICY "owners_create_company" ON public.companies FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND private.current_company_id() IS NULL);
CREATE POLICY "owners_update_company" ON public.companies FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "users_read_own_or_admin_company_profiles" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = private.current_company_id() AND private.has_role(auth.uid(), 'admin')));
CREATE POLICY "users_read_own_or_admin_company_entries" ON public.time_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = private.current_company_id() AND private.has_role(auth.uid(), 'admin')));
CREATE POLICY "users_create_own_entries" ON public.time_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND company_id = private.current_company_id());

CREATE OR REPLACE FUNCTION private.claim_new_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.owner_id = auth.uid() THEN
    UPDATE public.profiles SET company_id = NEW.id WHERE user_id = auth.uid() AND company_id IS NULL;
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.claim_new_company() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_company_created AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION private.claim_new_company();