import { Brand } from "@/components/brand";
import { useCompanyReport } from "@/hooks/use-company-report";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, FileText, LogOut, Plus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoursChart, ReportMetrics } from "@/components/report-ui";
import { hhmm, memberReport, monthLabel, timeLabel } from "@/lib/reports";
import { localDate } from "@/lib/work-schedule";

export function CompanyDashboardView({
  company,
  onSignOut,
  onManage,
  revision,
}: {
  company: { id: string; name: string };
  onSignOut: () => void;
  onManage: () => void;
  revision: number;
}) {
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const { data, loading, error } = useCompanyReport(month, revision + refresh);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setMonth(localDate().slice(0, 7));
        setRefresh((value) => value + 1);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/p/${company.id}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }
  const today = data ? localDate(new Date(data.generatedAt)) : localDate();
  return (
    <main className="min-h-svh bg-[#f5f5f7] px-5 py-6 text-[#1d1d1f] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-center justify-between border-b border-black/[.07] pb-5">
          <Brand />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-[#6e6e73] sm:inline">{company.name}</span>
            <Button variant="ghost" onClick={onSignOut}>
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </header>
        <section className="py-9 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold tracking-[.16em] text-[#0071e3]">PAINEL DA EMPRESA</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
                Sua equipe, em dia.
              </h1>
              <p className="mt-3 text-[#6e6e73]">
                {company.name} · {monthLabel(month)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/relatorios">
                  <FileText className="size-4" />
                  Relatórios
                </Link>
              </Button>
              <Button onClick={onManage}>
                <Plus className="size-4" />
                Gerenciar equipe
              </Button>
            </div>
          </div>
          <div className="mb-5 mt-8 flex items-center justify-between gap-3 text-xs text-[#86868b]">
            <span>
              {data
                ? `Atualizado às ${timeLabel(data.generatedAt)} · atualização a cada minuto`
                : "Dados do mês atual"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          {error ? (
            <div className="rounded-3xl border border-red-100 bg-white p-8" role="alert">
              <h2 className="font-semibold">Não foi possível atualizar o painel</h2>
              <p className="mt-2 text-sm text-red-700">{error}</p>
              <Button className="mt-5" onClick={() => setRefresh((value) => value + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : loading || !data ? (
            <div className="rounded-3xl bg-white p-12 text-center text-[#6e6e73]" role="status">
              Organizando as jornadas da equipe...
            </div>
          ) : (
            <>
              <ReportMetrics data={data} />
              <div className="mt-6">
                <HoursChart data={data} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
                <section className="rounded-[28px] border border-black/[.05] bg-white p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Equipe agora</h2>
                      <p className="mt-1 text-sm text-[#86868b]">
                        {data.members.length} funcionários cadastrados
                      </p>
                    </div>
                    <Users className="size-5 text-[#0071e3]" />
                  </div>
                  <div className="mt-5 divide-y divide-black/[.06]">
                    {!data.members.length && (
                      <p className="py-8 text-sm text-[#6e6e73]">
                        Adicione o primeiro funcionário para começar.
                      </p>
                    )}
                    {data.members.map((member) => {
                      const report = memberReport(data, member);
                      const day = report.days.find((row) => row.date === today);
                      const last = data.entries
                        .filter((entry) => entry.user_id === member.user_id)
                        .at(-1);
                      const active = last?.event_type === "clock_in";
                      const stale =
                        active &&
                        new Date(data.generatedAt).getTime() -
                          new Date(last.recorded_at).getTime() >
                          86400000;
                      return (
                        <div
                          key={member.user_id}
                          className="grid gap-3 py-4 sm:grid-cols-[1.3fr_1fr_auto]"
                        >
                          <div>
                            <p className="font-semibold">{member.full_name}</p>
                            <p className="mt-1 text-xs text-[#86868b]">
                              {member.job_title || "Funcionário"}
                            </p>
                          </div>
                          <div>
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${stale ? "bg-amber-50 text-amber-800" : active ? "bg-emerald-50 text-emerald-800" : "bg-[#f5f5f7] text-[#6e6e73]"}`}
                            >
                              {stale
                                ? "Conferir saída"
                                : active
                                  ? "Em expediente"
                                  : day?.expected
                                    ? "Fora do expediente"
                                    : "Folga"}
                            </span>
                            <p className="mt-2 text-xs text-[#86868b]">
                              {last
                                ? `Último: ${localDate(new Date(last.recorded_at)).slice(8)}/${localDate(new Date(last.recorded_at)).slice(5, 7)} · ${timeLabel(last.recorded_at)}`
                                : "Sem registros"}
                            </p>
                          </div>
                          <div className="text-sm sm:text-right">
                            <p className="font-semibold tabular-nums">{hhmm(day?.worked ?? 0)}</p>
                            <p className="mt-1 text-xs text-[#86868b]">na jornada de hoje</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <aside className="space-y-5">
                  <section className="rounded-[28px] bg-[#1d1d1f] p-6 text-white">
                    <p className="text-xs font-bold tracking-widest text-blue-300">
                      TERMINAL DA EQUIPE
                    </p>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                      Um link. Um PIN.
                      <br />
                      Ponto registrado.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">
                      Abra no aparelho compartilhado para registrar entradas e saídas.
                    </p>
                    <div className="mt-5 break-all rounded-xl bg-white/10 p-3 text-xs text-white/80">
                      {link}
                    </div>
                    <Button variant="secondary" className="mt-3 w-full" onClick={copy}>
                      <Copy className="size-4" />
                      {copied ? "Link copiado" : "Copiar link de ponto"}
                    </Button>
                    {copyError && (
                      <p className="mt-2 text-xs" role="status">
                        Selecione e copie o endereço acima.
                      </p>
                    )}
                  </section>
                  <section className="rounded-[28px] border border-black/[.05] bg-white p-6">
                    <FileText className="size-6 text-[#0071e3]" />
                    <h2 className="mt-4 text-lg font-semibold">Fechamento sem improviso.</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">
                      Exporte para a contabilidade e prepare as folhas para assinatura.
                    </p>
                    <Button variant="outline" asChild className="mt-5 w-full">
                      <Link to="/relatorios">Abrir relatórios</Link>
                    </Button>
                  </section>
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
