import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    z.object({ companyId: z.string().uuid(), ticket: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("confirm_clock_pin", {
      p_company: data.companyId,
      p_ticket: data.ticket,
    });
    if (result.error)
      throw new Error(
        "Não foi possível registrar agora. Consulte o responsável antes de tentar novamente.",
      );
    return receiptResult.parse(result.data);
  });
