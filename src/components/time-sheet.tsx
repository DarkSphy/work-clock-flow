import {
  dayStatus,
  hhmm,
  monthLabel,
  timeLabel,
  type MemberReport,
  type ReportData,
} from "@/lib/reports";
import { localDate } from "@/lib/work-schedule";

export function TimeSheet({
  data,
  report,
  companyDocument,
}: {
  data: ReportData;
  report: MemberReport;
  companyDocument: string;
}) {
  const partial = data.month >= localDate(new Date(data.generatedAt)).slice(0, 7);
  return (
    <article className="time-sheet">
      <header className="sheet-header">
        <div>
          <p className="sheet-brand">
            simbi<span>CONTROLE DE JORNADA</span>
          </p>
          <h1>Folha de ponto</h1>
          <p className="sheet-period">{monthLabel(data.month)}</p>
        </div>
        <div className="sheet-meta">
          <strong>{partial ? "PERÍODO EM ABERTO" : "CONFERÊNCIA MENSAL"}</strong>
          <span>
            Emitida em{" "}
            {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </span>
          <span>Horários de São Paulo</span>
        </div>
      </header>
      <section className="sheet-identification">
        <div>
          <span>EMPRESA</span>
          <strong>{data.company.name}</strong>
        </div>
        <div>
          <span>CNPJ / IDENTIFICAÇÃO</span>
          <strong>{companyDocument || "________________________________"}</strong>
        </div>
        <div>
          <span>FUNCIONÁRIO</span>
          <strong>{report.member.full_name}</strong>
        </div>
        <div>
          <span>CARGO</span>
          <strong>{report.member.job_title || "________________________________"}</strong>
        </div>
      </section>
      <section className="sheet-totals">
        <div>
          <span>Registradas</span>
          <strong>{hhmm(report.worked)}</strong>
        </div>
        <div>
          <span>Previstas apuradas</span>
          <strong>{hhmm(report.expected)}</strong>
        </div>
        <div>
          <span>Saldo apurado</span>
          <strong>
            {report.balance >= 0 ? "+" : ""}
            {hhmm(report.balance)}
          </strong>
        </div>
        <div>
          <span>Dias a conferir</span>
          <strong>{report.pendingDays}</strong>
        </div>
      </section>
      <table className="sheet-table">
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "37%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Previsto</th>
            <th>Marcações — entrada / saída</th>
            <th>Horas</th>
            <th>Saldo / situação</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((day) => (
            <tr key={day.date} className={day.pending ? "sheet-pending" : ""}>
              <td>
                <strong>{day.date.slice(8)}</strong>{" "}
                <span className="sheet-weekday">
                  {new Date(`${day.date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                    weekday: "short",
                    timeZone: "America/Sao_Paulo",
                  })}
                </span>
              </td>
              <td>
                {day.expected ? (
                  <>
                    {day.plan.start}–{day.plan.end}
                    <small>({day.plan.breakMinutes}m)</small>
                  </>
                ) : day.settled ? (
                  "Folga"
                ) : (
                  "—"
                )}
              </td>
              <td className="sheet-punches">
                {day.entries.length
                  ? day.entries
                      .map(
                        (entry) =>
                          `${entry.event_type === "clock_in" ? "E" : "S"} ${timeLabel(entry.recorded_at)}`,
                      )
                      .join("  ·  ")
                  : "—"}
              </td>
              <td>{hhmm(day.worked)}</td>
              <td>
                {day.settled && !day.pending ? (
                  <>
                    {day.worked >= day.expected ? "+" : ""}
                    {hhmm(day.worked - day.expected)}
                    {!day.entries.length && day.expected > 0 && (
                      <small>{dayStatus(day, data.generatedAt)}</small>
                    )}
                  </>
                ) : (
                  dayStatus(day, data.generatedAt)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="sheet-footer">
        <p className="sheet-note">
          E = entrada · S = saída · (m) = minutos de pausa prevista. Marcações originais por data;
          jornadas noturnas são apuradas no dia de início. Saldo estimado pela escala atual. Hoje e
          marcações incompletas não entram no saldo apurado. Feriados, férias e abonos não aplicados
          automaticamente.
        </p>
        <div className="sheet-observations">
          <strong>Observações / divergências:</strong>
          <div />
          <div />
        </div>
        <div className="sheet-signatures">
          <div>
            <span>Assinatura do funcionário</span>
            <small>Data: ____ / ____ / ______</small>
          </div>
          <div>
            <span>Assinatura do responsável</span>
            <small>Data: ____ / ____ / ______</small>
          </div>
        </div>
      </footer>
    </article>
  );
}
