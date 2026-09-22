import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const employeeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2).max(100),
  jobTitle: z.string().trim().min(2).max(80),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => employeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", context.userId)
      .single();

    if (profileError || !profile?.company_id) throw new Error("Empresa não encontrada.");

    const { data: adminRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) throw new Error("Somente administradores podem cadastrar funcionários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (createError || !created.user) throw new Error(createError?.message ?? "Não foi possível criar o acesso.");

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ company_id: profile.company_id, full_name: data.fullName, job_title: data.jobTitle })
      .eq("user_id", created.user.id);

    if (updateError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Não foi possível vincular o funcionário à empresa.");
    }

    const { error: employeeRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "employee" });

    if (employeeRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Não foi possível atribuir o acesso de funcionário.");
    }
    return { id: created.user.id };
  });
