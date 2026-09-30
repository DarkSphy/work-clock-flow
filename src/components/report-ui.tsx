import { useMemo, useState } from "react";
import { hhmm, memberReport, type ReportData } from "@/lib/reports";
import { localDate } from "@/lib/work-schedule";

export function ReportMetrics({ data }: { data: ReportData }) {
  const reports = useMemo(() => data.members.map((member) => memberReport(data, member)), [data]);
  const totals = reports.reduce(
    (sum, r) => ({
      worked: sum.worked + r.worked,
      positive: sum.positive + r.positive,
      negative: sum.negative + r.negative,
      pending: sum.pending + r.pendingDays,
    }),
    { worked: 0, positive: 0, negative: 0, pending: 0 },
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {
          label: "Horas registradas",
          value: hhmm(totals.worked),
          detail: "inclui jornadas em andamento",
          color: "text-[#1d1d1f]",
        },
        {
          label: "Excedente diário",
          value: hhmm(totals.positive),
          detail: "antes de compensações e adicionais",
          color: "text-[#087c60]",
        },
        {
          label: "Déficit diário",
          value: hhmm(totals.negative),
          detail: "pela escala dos dias apurados",
          color: "text-[#ae5a14]",
        },
        {
          label: "Dias para conferir",
          value: String(totals.pending),
          detail: "marcações incompletas na equipe",
          color: totals.pending ? "text-[#ae5a14]" : "text-[#1d1d1f]",
        },
      ].map((item) => (
        <article
          key={item.label}
          className="rounded-3xl border border-black/[.05] bg-white p-6 shadow-[0_6px_24px_rgba(0,0,0,.025)]"
        >
          <p className="text-sm text-[#6e6e73]">{item.label}</p>
          <p className={`mt-4 text-4xl font-semibold tracking-tight tabular-nums ${item.color}`}>
            {item.value}
          </p>
          <p className="mt-3 text-xs text-[#86868b]">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}
export function HoursChart({ data }: { data: ReportData }) {
  const reports = useMemo(() => data.members.map((member) => memberReport(data, member)), [data]);
  const today = localDate(new Date(data.generatedAt));
  const days =
    reports[0]?.days
      .filter((day) => day.date <= today)
      .map((day, index) => ({
        date: day.date,
        worked: reports.reduce((sum, report) => sum + report.days[index]!.worked, 0),
        expected: reports.reduce((sum, report) => sum + report.days[index]!.expected, 0),
        pending: reports.some((report) => report.days[index]!.pending),
      })) ?? [];
  const max = Math.max(60, ...days.flatMap((day) => [day.worked, day.expected]));
  const [selected, setSelected] = useState<string | null>(null);
  const current = days.find((day) => day.date === selected) ?? days.at(-1);
  return (
    <section className="rounded-[28px] border border-black/[.05] bg-white p-6 shadow-[0_6px_24px_rgba(0,0,0,.025)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-[#0071e3]">JORNADA DA EQUIPE</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Horas registradas × previstas
          </h2>
          <p className="mt-2 text-sm text-[#6e6e73]">
            Toque em um dia para conferir os valores reais.
          </p>
        </div>
        <div className="flex gap-4 text-xs text-[#6e6e73]">
          <span className="flex items-center gap-2">
            <i className="size-2.5 rounded-sm bg-[#0071e3]" />
            Registradas
          </span>
          <span className="flex items-center gap-2">
            <i className="size-2.5 rounded-sm bg-[#d7e5f7]" />
            Previstas
          </span>
        </div>
      </div>
      {!days.length ? (
        <p className="py-16 text-center text-sm text-[#86868b]">
          Cadastre funcionários para acompanhar as jornadas.
        </p>
      ) : (
        <>
          <div className="mt-8 overflow-x-auto pb-2">
            <div className="flex h-48 min-w-[620px] items-end gap-1.5 border-b border-black/10">
              {days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelected(day.date)}
                  aria-label={`${day.date}: ${hhmm(day.worked)} registradas, ${hhmm(day.expected)} previstas${day.pending ? ", conferir marcações" : ""}`}
                  aria-pressed={current?.date === day.date}
                  className={`group flex h-full min-w-4 flex-1 flex-col justify-end rounded-t-lg px-0.5 focus-visible:outline-2 focus-visible:outline-blue-600 ${current?.date === day.date ? "bg-blue-50" : "hover:bg-[#f5f5f7]"}`}
                >
                  <span className="flex h-40 items-end justify-center gap-0.5">
                    <span
                      className="w-2/5 rounded-t-sm bg-[#0071e3]"
                      style={{
                        height: `${(day.worked / max) * 100}%`,
                        minHeight: day.worked ? 2 : 0,
                      }}
                    />
                    <span
                      className="w-2/5 rounded-t-sm bg-[#d7e5f7]"
                      style={{
                        height: `${(day.expected / max) * 100}%`,
                        minHeight: day.expected ? 2 : 0,
                      }}
                    />
                  </span>
                  <span className="py-2 text-[10px] text-[#6e6e73]">{day.date.slice(-2)}</span>
                </button>
              ))}
            </div>
          </div>
          {current && (
            <div
              className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm"
              role="status"
            >
              <strong>Dia {current.date.slice(-2)}</strong>
              <span>{hhmm(current.worked)} registradas</span>
              <span className="text-[#6e6e73]">{hhmm(current.expected)} previstas</span>
              {current.pending && <span className="text-amber-700">Conferir marcações</span>}
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs leading-relaxed text-[#86868b]">
        Horários de São Paulo. Hoje é parcial. A previsão segue a escala atual; feriados, férias e
        abonos precisam de conferência.
      </p>
    </section>
  );
}
