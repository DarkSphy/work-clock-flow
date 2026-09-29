import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const daySchema = z
  .object({
    enabled: z.boolean(),
    start: time,
    end: time,
    breakMinutes: z.number().int().min(0).max(480),
  })
  .refine(
    (day) =>
      !day.enabled || (day.start !== day.end && duration(day.start, day.end) > day.breakMinutes),
    "Confira os horários e o intervalo: a jornada precisa ter horas de trabalho.",
  );
export const scheduleSchema = z.array(daySchema).length(7);
export type WorkSchedule = z.infer<typeof scheduleSchema>;
export const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function duration(start: string, end: string) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const difference = toMinutes(end) - toMinutes(start);
  return difference > 0 ? difference : difference + 1440;
}
export function defaultSchedule(start = "08:00", end = "17:00", breakMinutes = 60): WorkSchedule {
  return dayNames.map((_, index) => ({
    enabled: index > 0 && index < 6,
    start: start.slice(0, 5),
    end: end.slice(0, 5),
    breakMinutes,
  }));
}
export function readSchedule(value: unknown, fallback = defaultSchedule()): WorkSchedule {
  const result = scheduleSchema.safeParse(value);
  return result.success ? result.data : fallback;
}
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function localDate(date = new Date()) {
  return dateFormatter.format(date);
}
export function hours(minutes: number) {
  const total = Math.round(Math.abs(minutes));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`;
}

export type ClockEntry = { id: string; event_type: "clock_in" | "clock_out"; recorded_at: string };
export function monthlySummary(
  entries: ClockEntry[],
  month: string,
  schedule: WorkSchedule,
  employmentStart: string,
  now = new Date(),
) {
  // Business dates consistently use São Paulo, irrespective of the device timezone.
  const today = localDate(now);
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
    const plan = schedule[weekday]!;
    return {
      date,
      plan,
      worked: 0,
      expected:
        date >= employmentStart && plan.enabled
          ? duration(plan.start, plan.end) - plan.breakMinutes
          : 0,
      pending: false,
      entries: entries.filter((entry) => localDate(new Date(entry.recorded_at)) === date),
      settled: date < today && date >= employmentStart,
    };
  });
  let open: number | null = null;
  const shiftDate = (stamp: number) => {
    const date = localDate(new Date(stamp));
    const previous = localDate(new Date(new Date(`${date}T12:00:00-03:00`).getTime() - 86_400_000));
    const plan = schedule[new Date(`${previous}T12:00:00-03:00`).getUTCDay()]!;
    const time = timeFormatter.format(new Date(stamp));
    return plan.enabled && plan.end < plan.start && time < plan.end ? previous : date;
  };
  const addInterval = (start: number, end: number, pending: boolean) => {
    const day = days.find((item) => item.date === shiftDate(start));
    if (day) {
      if (pending) day.pending = true;
      else day.worked += Math.max(0, end - start) / 60000;
    }
  };
  for (const entry of [...entries].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) {
    const stamp = new Date(entry.recorded_at).getTime();
    if (stamp > now.getTime()) continue;
    if (entry.event_type === "clock_in") {
      if (open !== null) addInterval(open, stamp, true);
      open = stamp;
    } else if (open !== null) {
      addInterval(open, stamp, stamp - open > 24 * 3600000);
      open = null;
    } else {
      const day = days.find((item) => item.date === localDate(new Date(stamp)));
      if (day) day.pending = true;
    }
  }
  if (open !== null) {
    const age = now.getTime() - open;
    addInterval(open, now.getTime(), age > 24 * 3600000);
    for (const day of days)
      if (day.date >= localDate(new Date(open)) && day.date <= today) day.pending = true;
  }
  // Today stays provisional; future days and incomplete records never become debt.
  const settled = days.filter((day) => day.settled && !day.pending);
  const balance = settled.reduce((sum, day) => sum + day.worked - day.expected, 0);
  return {
    days,
    worked: days.reduce((sum, day) => sum + day.worked, 0),
    expected: settled.reduce((sum, day) => sum + day.expected, 0),
    balance,
    extra: Math.max(0, balance),
    owed: Math.max(0, -balance),
  };
}
