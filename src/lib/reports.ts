import {
  defaultSchedule,
  localDate,
  monthlySummary,
  readSchedule,
  type ClockEntry,
} from "./work-schedule.ts";

export type ReportCompany = {
  id: string;
  name: string;
  work_start: string;
  work_end: string;
  break_minutes: number;
};
export type ReportMember = {
  user_id: string;
  full_name: string;
  job_title: string;
  employment_start: string;
  work_schedule: unknown;
  work_start: string | null;
  work_end: string | null;
  break_minutes: number | null;
};
export type ReportEntry = ClockEntry & { user_id: string };
export type ReportData = {
  company: ReportCompany;
  members: ReportMember[];
  entries: ReportEntry[];
  month: string;
  generatedAt: string;
};
export function memberReport(data: ReportData, member: ReportMember) {
  const schedule = readSchedule(
    member.work_schedule,
    defaultSchedule(
      member.work_start ?? data.company.work_start,
      member.work_end ?? data.company.work_end,
      member.break_minutes ?? data.company.break_minutes,
    ),
  );
  const summary = monthlySummary(
    data.entries.filter((entry) => entry.user_id === member.user_id),
    data.month,
    schedule,
    member.employment_start,
    new Date(data.generatedAt),
  );
  const closed = summary.days.filter((day) => day.settled && !day.pending);
  return {
    member,
    ...summary,
    closedWorked: closed.reduce((sum, day) => sum + day.worked, 0),
    positive: closed.reduce((sum, day) => sum + Math.max(0, day.worked - day.expected), 0),
    negative: closed.reduce((sum, day) => sum + Math.max(0, day.expected - day.worked), 0),
    pendingDays: summary.days.filter((day) => day.pending).length,
  };
}
export type MemberReport = ReturnType<typeof memberReport>;
export function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}
export function hhmm(minutes: number) {
  const total = Math.round(Math.abs(minutes));
  return `${minutes < 0 ? "−" : ""}${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function timeLabel(stamp: string) {
  return new Date(stamp).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function dayStatus(day: MemberReport["days"][number], generatedAt: string) {
  if (day.pending) return "Conferir marcações";
  if (day.date > localDate(new Date(generatedAt))) return "Dia futuro";
  if (day.date === localDate(new Date(generatedAt))) return "Dia em andamento";
  if (!day.settled) return "Antes do início";
  if (!day.expected) return day.worked ? "Trabalho em folga" : "Folga";
  return !day.entries.length && !day.worked ? "Sem marcações" : "Apurado";
}

// Quote every cell and neutralize spreadsheet formulas in user-provided strings.
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value);
            // eslint-disable-next-line no-control-regex -- Detect formulas even after leading control characters.
            if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(cell))
              cell = "'" + cell;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export function summaryCsv(data: ReportData, reports: MemberReport[]) {
  return csv([
    [
      "Empresa",
      "Mês",
      "ID funcionário",
      "Funcionário",
      "Cargo",
      "Horas registradas (hh:mm)",
      "Horas apuradas (min)",
      "Horas previstas apuradas (min)",
      "Excedente diário (min)",
      "Déficit diário (min)",
      "Saldo líquido (min)",
      "Dias com marcações pendentes",
      "Gerado em",
      "Critério",
    ],
    ...reports.map((r) => [
      data.company.name,
      data.month,
      r.member.user_id,
      r.member.full_name,
      r.member.job_title,
      hhmm(r.worked),
      Math.round(r.closedWorked),
      Math.round(r.expected),
      Math.round(r.positive),
      Math.round(r.negative),
      Math.round(r.balance),
      r.pendingDays,
      data.generatedAt,
      "Estimativa pela escala atual; exclui hoje, dias futuros e marcações incompletas do saldo. Feriados, férias e abonos não aplicados.",
    ]),
  ]);
}
export function detailsCsv(data: ReportData, reports: MemberReport[]) {
  return csv([
    [
      "Empresa",
      "Mês",
      "ID funcionário",
      "Funcionário",
      "Cargo",
      "Data",
      "Jornada prevista",
      "Intervalo previsto (min)",
      "Marcações originais (São Paulo)",
      "Trabalhadas (min)",
      "Previstas (min)",
      "Saldo apurado (min)",
      "Situação",
    ],
    ...reports.flatMap((r) =>
      r.days.map((day) => [
        data.company.name,
        data.month,
        r.member.user_id,
        r.member.full_name,
        r.member.job_title,
        day.date,
        day.expected ? `${day.plan.start}–${day.plan.end}` : "—",
        day.expected ? day.plan.breakMinutes : 0,
        day.entries
          .map(
            (entry) =>
              `${entry.event_type === "clock_in" ? "Entrada" : "Saída"} ${timeLabel(entry.recorded_at)}`,
          )
          .join(" | "),
        Math.round(day.worked),
        day.expected,
        day.settled && !day.pending ? Math.round(day.worked - day.expected) : "",
        dayStatus(day, data.generatedAt),
      ]),
    ),
  ]);
}
export function rawEntriesCsv(data: ReportData, reports: MemberReport[]) {
  const members = new Map(reports.map((report) => [report.member.user_id, report.member]));
  return csv([
    [
      "Empresa",
      "ID funcionário",
      "Funcionário",
      "ID registro",
      "Data local",
      "Horário local",
      "Tipo",
      "Data e hora original (UTC)",
    ],
    ...data.entries
      .filter(
        (entry) =>
          members.has(entry.user_id) &&
          localDate(new Date(entry.recorded_at)).startsWith(data.month),
      )
      .map((entry) => [
        data.company.name,
        entry.user_id,
        members.get(entry.user_id)!.full_name,
        entry.id,
        localDate(new Date(entry.recorded_at)),
        timeLabel(entry.recorded_at),
        entry.event_type === "clock_in" ? "Entrada" : "Saída",
        entry.recorded_at,
      ]),
  ]);
}
export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function monthBounds(month: string) {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const first = `${month}-01T00:00:00-03:00`;
  return {
    from: new Date(new Date(first).getTime() - 86_400_000).toISOString(),
    to: `${new Date(Date.UTC(year, monthNumber, 2)).toISOString().slice(0, 10)}T00:00:00-03:00`,
  };
}
