import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { decodeClockPhoto } from "@/lib/clock-photo";

const clockResult = z.union([
  z.object({ error: z.string() }),
  z.object({
    name: z.string(),
    eventType: z.enum(["clock_in", "clock_out"]),
    ticket: z.string().uuid(),
  }),
]);
const receiptResult = z.union([
  z.object({ error: z.string() }),
  z.object({ eventType: z.enum(["clock_in", "clock_out"]), recordedAt: z.string() }),
]);

export const identifyClockPin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ companyId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("identify_clock_pin", {
      p_company: data.companyId,
      p_pin: data.pin,
    });
    if (result.error)
      throw new Error("Não foi possível consultar o PIN. Avise o responsável pela empresa.");
    return clockResult.parse(result.data);
  });

export const confirmClockPin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid(),
        ticket: z.string().uuid(),
        photo: z.string().max(800_023),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const bytes = decodeClockPhoto(data.photo);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prepared = await supabaseAdmin.rpc("prepare_clock_photo", {
      p_company: data.companyId,
      p_ticket: data.ticket,
    });
    if (prepared.error)
      throw new Error("Não foi possível preparar a foto. Avise o responsável pela empresa.");
    const preparation = z
      .union([receiptResult, z.object({ path: z.string() })])
      .parse(prepared.data);
    if (!("path" in preparation)) return preparation;
    const uploaded = await supabaseAdmin.storage
      .from("clock-photos")
      .upload(preparation.path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "0",
      });
    // Same ticket always uses the same immutable file, including response-loss retries.
    if (uploaded.error) {
      const existing = await supabaseAdmin.storage.from("clock-photos").info(preparation.path);
      if (existing.error || !existing.data)
        throw new Error("Não foi possível enviar a foto. Tente confirmar novamente.");
    }
    const result = await supabaseAdmin.rpc("confirm_clock_pin", {
      p_company: data.companyId,
      p_ticket: data.ticket,
    });
    if (result.error)
      throw new Error(
        "Não foi possível registrar agora. Consulte o responsável antes de tentar novamente.",
      );
    // Do not remove files after an ambiguous response: the transaction may have committed.
    return receiptResult.parse(result.data);
  });
