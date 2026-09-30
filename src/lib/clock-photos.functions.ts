import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function adminCompany(supabase: SupabaseClient<Database>, userId: string) {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  const [profile, role] = await Promise.all([
    supabase.from("profiles").select("company_id").eq("user_id", userId).single(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (profile.error || role.error || !profile.data?.company_id || !role.data)
    throw new Error("Entre como responsável pela empresa para consultar as fotos.");
  return profile.data.company_id;
}

export const listClockPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        date: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
        page: z.number().int().min(0).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await adminCompany(context.supabase, context.userId);
    const start = new Date(`${data.date}T00:00:00-03:00`);
    if (!Number.isFinite(start.getTime())) throw new Error("Data inválida.");
    const end = new Date(start.getTime() + 86400000);
    const result = await context.supabase
      .from("clock_photos")
      .select("entry_id, user_id, recorded_at, event_type")
      .eq("company_id", company)
      .gte("recorded_at", start.toISOString())
      .lt("recorded_at", end.toISOString())
      .order("recorded_at", { ascending: false })
      .order("entry_id")
      .range(data.page * 20, data.page * 20 + 20);
    if (result.error)
      throw new Error(
        "Não foi possível consultar as fotos. Confira se o SQL de fotos foi aplicado.",
      );
    const entries = result.data.slice(0, 20);
    const ids = [...new Set(entries.map((entry) => entry.user_id))];
    const profiles = ids.length
      ? await context.supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("company_id", company)
          .in("user_id", ids)
      : { data: [], error: null };
    if (profiles.error) throw new Error("Não foi possível identificar os funcionários.");
    return {
      hasMore: result.data.length > 20,
      entries: entries.map((entry) => ({
        ...entry,
        name:
          profiles.data?.find((profile) => profile.user_id === entry.user_id)?.full_name ??
          "Funcionário removido",
      })),
    };
  });

export const viewClockPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ entryId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const company = await adminCompany(context.supabase, context.userId);
    const result = await context.supabase
      .from("clock_photos")
      .select("object_path")
      .eq("entry_id", data.entryId)
      .eq("company_id", company)
      .maybeSingle();
    if (result.error || !result.data) throw new Error("Foto indisponível para esta empresa.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("clock-photos")
      .createSignedUrl(result.data.object_path, 120);
    if (signed.error || !signed.data)
      throw new Error("Não foi possível abrir a foto. Tente novamente.");
    return { url: signed.data.signedUrl };
  });
