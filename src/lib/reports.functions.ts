import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { monthBounds } from "@/lib/reports";

import { collectPages } from "@/lib/report-pagination";

export const loadCompanyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ month: z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const [{ data: profile, error: profileError }, { data: role, error: roleError }] =
      await Promise.all([
        context.supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", context.userId)
          .single(),
        context.supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .eq("role", "admin")
          .maybeSingle(),
      ]);
    if (profileError || roleError || !profile?.company_id || !role)
      throw new Error("Somente o responsável pela empresa pode consultar estes relatórios.");
    // Tenant comes exclusively from the verified user; never accept company IDs from callers.
    const companyId = profile.company_id;
    const { data: company, error: companyError } = await context.supabase
      .from("companies")
      .select("id, name, owner_id, work_start, work_end, break_minutes")
      .eq("id", companyId)
      .single();
    if (companyError || !company) throw new Error("Não foi possível carregar a empresa.");
    const members = await collectPages((start, end) =>
      context.supabase
        .from("profiles")
        .select(
          "user_id, full_name, job_title, employment_start, work_schedule, work_start, work_end, break_minutes",
        )
        .eq("company_id", companyId)
        .neq("user_id", company.owner_id)
        .order("user_id")
        .range(start, end),
    );
    const bounds = monthBounds(data.month);
    const generatedAt = new Date().toISOString();
    const entries = await collectPages((start, end) =>
      context.supabase
        .from("time_entries")
        .select("id, user_id, event_type, recorded_at")
        .eq("company_id", companyId)
        .gte("recorded_at", bounds.from)
        .lt("recorded_at", bounds.to)
        .lte("recorded_at", generatedAt)
        .order("recorded_at")
        .order("id")
        .range(start, end),
    );
    // Carry in the last event to detect an open shift before the requested period.
    for (let offset = 0; offset < members.length; offset += 8) {
      const previous = await Promise.all(
        members.slice(offset, offset + 8).map(async (member) => {
          const result = await context.supabase
            .from("time_entries")
            .select("id, user_id, event_type, recorded_at")
            .eq("company_id", companyId)
            .eq("user_id", member.user_id)
            .lt("recorded_at", bounds.from)
            .order("recorded_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (result.error) throw new Error("Não foi possível conferir as jornadas anteriores.");
          return result.data?.event_type === "clock_in" ? result.data : null;
        }),
      );
      entries.push(
        ...previous.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      );
    }
    return {
      company,
      members,
      entries: entries.sort(
        (a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id),
      ),
      month: data.month,
      generatedAt,
    };
  });
