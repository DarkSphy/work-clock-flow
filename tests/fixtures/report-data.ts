import { defaultSchedule } from "../../src/lib/work-schedule.ts";
import type { ReportData } from "../../src/lib/reports.ts";
export const reportFixture: ReportData = {
  company: {
    id: "company-example",
    name: "Aurora Serviços Administrativos — EXEMPLO",
    work_start: "08:00",
    work_end: "17:00",
    break_minutes: 60,
  },
  month: "2026-08",
  generatedAt: "2026-09-01T15:00:00Z",
  members: [
    {
      user_id: "employee-example-1",
      full_name: "Marina Costa de Albuquerque",
      job_title: "Assistente administrativa",
      employment_start: "2026-08-01",
      work_schedule: defaultSchedule(),
      work_start: null,
      work_end: null,
      break_minutes: null,
    },
    {
      user_id: "employee-example-2",
      full_name: "Rafael Lima",
      job_title: "Analista de operações",
      employment_start: "2026-08-01",
      work_schedule: defaultSchedule(),
      work_start: null,
      work_end: null,
      break_minutes: null,
    },
  ],
  entries: [],
};
for (let day = 1; day <= 31; day++) {
  const date = `2026-08-${String(day).padStart(2, "0")}`;
  const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  if (weekday === 0 || weekday === 6) continue;
  for (const member of reportFixture.members) {
    const times =
      member.user_id.endsWith("2") && day === 14
        ? ["08:00"]
        : ["08:00", "12:00", "13:00", day === 10 ? "18:00" : "17:00"];
    times.forEach((time, index) =>
      reportFixture.entries.push({
        id: `${member.user_id}-${day}-${index}`,
        user_id: member.user_id,
        event_type: index % 2 ? "clock_out" : "clock_in",
        recorded_at: new Date(`${date}T${time}:00-03:00`).toISOString(),
      }),
    );
  }
}
