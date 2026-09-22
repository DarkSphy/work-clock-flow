-- Company owners manage the team. Only employees may record their own time.
DROP POLICY IF EXISTS "users_create_own_entries" ON public.time_entries;
CREATE POLICY "employees_create_own_entries" ON public.time_entries
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND company_id = private.current_company_id()
  AND private.has_role(auth.uid(), 'employee')
  AND NOT private.has_role(auth.uid(), 'admin')
);
