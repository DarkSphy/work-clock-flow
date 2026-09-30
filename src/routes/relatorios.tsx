import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyReport } from "@/hooks/use-company-report";
import { TimeSheet } from "@/components/time-sheet";
import {
  detailsCsv,
  downloadCsv,
  hhmm,
  memberReport,
  monthLabel,
  rawEntriesCsv,
  summaryCsv,
} from "@/lib/reports";
import { localDate } from "@/lib/work-schedule";
import "@/report-print.css";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios | Simbi" }, { name: "robots", content: "noindex" }] }),
  component: Reports,
});
function Reports() {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [employeeId, setEmployeeId] = useState("");
  const [revision, setRevision] = useState(0);
  const [companyDocument, setCompanyDocument] = useState("");
  const [previewId, setPreviewId] = useState("");
  const { data, loading, error } = useCompanyReport(month, revision);
  const reports = useMemo(
    () =>
      data
        ? data.members
            .filter((member) => !employeeId || member.user_id === employeeId)
            .map((member) => memberReport(data, member))
        : [],
    [data, employeeId],
  );
  const pending = reports.reduce((sum, report) => sum + report.pendingDays, 0);
  const preview = reports.find((report) => report.member.user_id === previewId) ?? reports[0];
  function exportFile(kind: "summary" | "details" | "raw") {
    if (!data || !reports.length) return;
    const content =
      kind === "summary"
        ? summaryCsv(data, reports)
        : kind === "details"
          ? detailsCsv(data, reports)
          : rawEntriesCsv(data, reports);
    downloadCsv(
      content,
      `simbi-${kind === "summary" ? "resumo" : kind === "details" ? "diario" : "marcacoes"}-${month}${employeeId ? `-${employeeId.slice(0, 8)}` : "-equipe"}.csv`,
    );
  }
  return (
    <main className="report-page min-h-svh bg-[#f5f5f7] px-5 py-6 text-[#1d1d1f] sm:px-8">
      <div className="report-screen mx-auto max-w-7xl">
        <header className="flex items-center justify-between border-b border-black/[.07] pb-5">
          <Link to="/" className="text-2xl font-semibold tracking-tight">
            simbi
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Painel da empresa
            </Link>
          </Button>
        </header>
        <section className="py-9 sm:py-12">
          <p className="text-xs font-bold tracking-[.16em] text-[#0071e3]">
            RELATÓRIOS E FECHAMENTO
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
            Do registro à conferência.
          </h1>
          <p className="mt-4 max-w-2xl text-[#6e6e73]">
            Todos os pontos do mês, organizados para sua contabilidade e para a assinatura da
            equipe.
          </p>
          <div className="mt-8 grid items-end gap-4 rounded-[28px] border border-black/[.05] bg-white p-6 md:grid-cols-[180px_1fr_1fr_auto]">
            <label className="text-xs font-semibold text-[#6e6e73]">
              Mês de referência
              <Input
                type="month"
                min="2020-01"
                max={localDate().slice(0, 7)}
                value={month}
                className="mt-2 h-11"
                onChange={(e) => {
                  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) {
                    setMonth(e.target.value);
                    setPreviewId("");
                  }
                }}
              />
            </label>
            <label className="text-xs font-semibold text-[#6e6e73]">
              Funcionário
              <select
                className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1d1d1f]"
                value={employeeId}
                disabled={loading || !!error}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setPreviewId("");
                }}
              >
                <option value="">Toda a equipe</option>
                {data?.members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#6e6e73]">
              CNPJ / identificação para impressão
              <Input
                maxLength={60}
                className="mt-2 h-11"
                placeholder="Opcional · somente nesta impressão"
                value={companyDocument}
                onChange={(e) => setCompanyDocument(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              className="h-11"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          {error ? (
            <div className="mt-6 rounded-3xl bg-white p-8" role="alert">
              <h2 className="font-semibold">Não foi possível carregar o relatório</h2>
              <p className="mt-2 text-sm text-red-700">{error}</p>
              <p className="mt-3 text-sm text-[#6e6e73]">
                Entre pela Área da empresa para consultar os relatórios da equipe.
              </p>
            </div>
          ) : loading || !data ? (
            <p className="py-16 text-center text-[#6e6e73]" role="status">
              Reunindo todos os registros do período...
            </p>
          ) : (
            <>
              <div className="mt-7 grid gap-4 lg:grid-cols-3">
                <article className="rounded-[28px] bg-[#1d1d1f] p-6 text-white">
                  <FileSpreadsheet className="size-6 text-blue-300" />
                  <h2 className="mt-5 text-xl font-semibold">Para a contabilidade</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Resumo por funcionário, horas previstas, excedentes, déficits e pendências.
                    Arquivo CSV compatível com Excel.
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-6 w-full"
                    disabled={!reports.length}
                    onClick={() => exportFile("summary")}
                  >
                    <Download className="size-4" />
                    Baixar resumo mensal
                  </Button>
                </article>
                <article className="rounded-[28px] border border-black/[.05] bg-white p-6">
                  <Download className="size-6 text-[#0071e3]" />
                  <h2 className="mt-5 text-xl font-semibold">Conferência detalhada</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">
                    Uma linha por dia para revisar a jornada, ou cada marcação original com seu
                    identificador e horário.
                  </p>
                  <div className="mt-6 grid gap-2">
                    <Button
                      variant="outline"
                      disabled={!reports.length}
                      onClick={() => exportFile("details")}
                    >
                      Baixar diário
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!reports.length}
                      onClick={() => exportFile("raw")}
                    >
                      Baixar marcações originais
                    </Button>
                  </div>
                </article>
                <article className="rounded-[28px] border border-blue-100 bg-[#eaf3ff] p-6">
                  <Printer className="size-6 text-[#0071e3]" />
                  <h2 className="mt-5 text-xl font-semibold">Folhas para assinatura</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#516477]">
                    Folha individual com todos os dias, resumo e espaço para assinaturas. Imprima ou
                    escolha “Salvar como PDF”.
                  </p>
                  <Button
                    className="mt-6 w-full"
                    disabled={!reports.length}
                    onClick={() => window.print()}
                  >
                    <Printer className="size-4" />
                    Imprimir / salvar PDF
                  </Button>
                </article>
              </div>
              <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-5 py-4 text-sm leading-relaxed text-amber-900">
                {pending ? (
                  <strong>
                    {pending} dia(s) com marcações incompletas. Confira antes de encaminhar.{" "}
                  </strong>
                ) : null}
                Os saldos são estimativas pela escala atual. Hoje e marcações incompletas ficam fora
                da apuração; feriados, férias, abonos e adicionais precisam de conferência.
              </div>
              <section className="mt-8 overflow-hidden rounded-[28px] border border-black/[.05] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 p-6">
                  <div>
                    <h2 className="text-xl font-semibold">Resumo de {monthLabel(month)}</h2>
                    <p className="mt-1 text-sm text-[#86868b]">
                      {reports.length} funcionário(s) · {data.company.name}
                    </p>
                  </div>
                  <span className="text-xs text-[#86868b]">
                    Emitido em{" "}
                    {new Date(data.generatedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-[#f5f5f7] text-[#6e6e73]">
                      <tr>
                        {[
                          "Funcionário",
                          "Registradas",
                          "Previstas apuradas",
                          "Saldo apurado",
                          "Pendências",
                          "Folha",
                        ].map((label) => (
                          <th key={label} className="px-6 py-4 font-medium">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.member.user_id} className="border-t border-black/[.05]">
                          <td className="px-6 py-4">
                            <p className="font-semibold">{report.member.full_name}</p>
                            <p className="mt-1 text-xs text-[#86868b]">{report.member.job_title}</p>
                          </td>
                          <td className="px-6 py-4 tabular-nums">{hhmm(report.worked)}</td>
                          <td className="px-6 py-4 tabular-nums">{hhmm(report.expected)}</td>
                          <td
                            className={`px-6 py-4 font-semibold tabular-nums ${report.balance < 0 ? "text-amber-800" : "text-emerald-800"}`}
                          >
                            {report.balance >= 0 ? "+" : ""}
                            {hhmm(report.balance)}
                          </td>
                          <td className="px-6 py-4">
                            {report.pendingDays ? `${report.pendingDays} dia(s)` : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              className="font-semibold text-[#0071e3]"
                              onClick={() => {
                                setPreviewId(report.member.user_id);
                                document
                                  .getElementById("sheet-preview")
                                  ?.scrollIntoView({ behavior: "smooth" });
                              }}
                            >
                              Visualizar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!reports.length && (
                  <p className="p-10 text-center text-[#86868b]">
                    Nenhum funcionário neste filtro.
                  </p>
                )}
              </section>
              {preview && (
                <section id="sheet-preview" className="mt-10 scroll-mt-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">Prévia da folha</h2>
                      <p className="mt-1 text-sm text-[#86868b]">
                        {preview.member.full_name} · A impressão inclui{" "}
                        {reports.length === 1
                          ? "esta folha"
                          : `as ${reports.length} folhas do filtro`}
                        .
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-[20px]">
                    <div className="sheet-preview min-w-[680px]">
                      <TimeSheet data={data} report={preview} companyDocument={companyDocument} />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </section>
      </div>
      {data && !loading && !error && (
        <div className="print-area">
          {reports.map((report) => (
            <TimeSheet
              key={report.member.user_id}
              data={data}
              report={report}
              companyDocument={companyDocument}
            />
          ))}
        </div>
      )}
    </main>
  );
}
