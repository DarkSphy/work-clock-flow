import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const employeeSchema = z.object({ email: z.string().email(), password: z.string().min(8), fullName: z.string().trim().min(2).max(100), jobTitle: z.string().trim().min(2).max(80), workStart: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")), workEnd: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")), breakMinutes: z.coerce.number().int().min(0).max(480) });
const updateEmployeeSchema = employeeSchema.extend({ userId: z.string().uuid(), password: z.union([z.string().min(8), z.literal("")]) });
const employeeIdSchema = z.object({ userId: z.string().uuid() });

async function requireCompanyAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: profile, error: profileError } = await context.supabase.from("profiles").select("company_id").eq("user_id", context.userId).single();
  if (profileError || !profile?.company_id) throw new Error("Empresa não encontrada.");
  const { data: adminRole, error: roleError } = await context.supabase.from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (roleError || !adminRole) throw new Error("Somente administradores podem gerenciar funcionários.");
  return profile.company_id as string;
}

async function requireEmployeeInCompany(userId: string, companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: profile }, { data: employeeRole }, { data: adminRole }] = await Promise.all([
    supabaseAdmin.from("profiles").select("user_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "employee").maybeSingle(),
    supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
  ]);
  if (!profile || !employeeRole || adminRole) throw new Error("Funcionário não encontrado nesta empresa.");
  return supabaseAdmin;
}

export const listEmployees = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const companyId = await requireCompanyAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles, error } = await supabaseAdmin.from("profiles").select("user_id, full_name, job_title, work_start, work_end, break_minutes").eq("company_id", companyId).neq("user_id", context.userId);
  if (error) throw new Error("Não foi possível carregar os funcionários.");
  const employees = await Promise.all((profiles ?? []).map(async (profile) => {
    const [{ data: role }, { data: authUser }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("id").eq("user_id", profile.user_id).eq("role", "employee").maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(profile.user_id),
    ]);
    return role ? { ...profile, email: authUser.user?.email ?? "" } : null;
  }));
  return employees.filter((employee): employee is NonNullable<typeof employee> => Boolean(employee));
});

export const createEmployee = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => employeeSchema.parse(input)).handler(async ({ data, context }) => {
  const companyId = await requireCompanyAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.fullName } });
  if (createError || !created.user) throw new Error(createError?.message ?? "Não foi possível criar o acesso.");
  const hasCustomSchedule = Boolean(data.workStart || data.workEnd);
  const { error: updateError } = await supabaseAdmin.from("profiles").update({ company_id: companyId, full_name: data.fullName, job_title: data.jobTitle, work_start: data.workStart || null, work_end: data.workEnd || null, break_minutes: hasCustomSchedule ? data.breakMinutes : null }).eq("user_id", created.user.id);
  if (updateError) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw new Error("Não foi possível vincular o funcionário à empresa."); }
  const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "employee" });
  if (roleError) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw new Error("Não foi possível atribuir o acesso de funcionário."); }
  return { id: created.user.id };
});

export const updateEmployee = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => updateEmployeeSchema.parse(input)).handler(async ({ data, context }) => {
  const companyId = await requireCompanyAdmin(context);
  const supabaseAdmin = await requireEmployeeInCompany(data.userId, companyId);
  const authChanges: { email: string; email_confirm: boolean; password?: string; user_metadata: { full_name: string } } = { email: data.email, email_confirm: true, user_metadata: { full_name: data.fullName } };
  if (data.password) authChanges.password = data.password;
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authChanges);
  if (authError) throw new Error(authError.message);
  const hasCustomSchedule = Boolean(data.workStart || data.workEnd);
  const { error: profileError } = await supabaseAdmin.from("profiles").update({ full_name: data.fullName, job_title: data.jobTitle, work_start: data.workStart || null, work_end: data.workEnd || null, break_minutes: hasCustomSchedule ? data.breakMinutes : null }).eq("user_id", data.userId).eq("company_id", companyId);
  if (profileError) throw new Error("O acesso foi atualizado, mas o perfil não pôde ser salvo.");
  return { success: true };
});

export const deleteEmployee = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => employeeIdSchema.parse(input)).handler(async ({ data, context }) => {
  const companyId = await requireCompanyAdmin(context);
  const supabaseAdmin = await requireEmployeeInCompany(data.userId, companyId);
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
  if (authError) throw new Error(authError.message);
  await Promise.all([
    supabaseAdmin.from("time_entries").delete().eq("user_id", data.userId).eq("company_id", companyId),
    supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId),
    supabaseAdmin.from("profiles").delete().eq("user_id", data.userId).eq("company_id", companyId),
  ]);
  return { success: true };
});
