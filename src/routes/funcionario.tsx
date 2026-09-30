import { Brand, BrandLoading } from "@/components/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  defaultSchedule,
  hours,
  localDate,
  monthlySummary,
  readSchedule,
  type ClockEntry,
  type WorkSchedule,
} from "@/lib/work-schedule";

export const Route = createFileRoute("/funcionario")({
  head: () => ({ meta: [{ title: "Meu ponto | Simbi" }, { name: "robots", content: "noindex" }] }),
  component: EmployeePortal,
});
type Worker = {
  id: string;
  name: string;
  companyName: string;
  schedule: WorkSchedule;
  startDate: string;
};
function EmployeePortal() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loadingEntries, setLoadingEntries] = useState(false);
  async function loadWorker(userId: string) {
    const [{ data: profile, error: profileError }, { data: roles, error: roleError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "full_name, company_id, work_start, work_end, break_minutes, work_schedule, employment_start",
          )
          .eq("user_id", userId)
          .single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
    if (profileError || roleError)
      throw new Error("Não foi possível carregar o perfil. Tente novamente.");
    if (
      !profile.company_id ||
      !roles?.some((role) => role.role === "employee") ||
      roles.some((role) => role.role === "admin")
    )
      throw new Error(
        "Este acesso é exclusivo de funcionários. Para administrar sua empresa, use a Área da empresa.",
      );
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, work_start, work_end, break_minutes")
      .eq("id", profile.company_id)
      .single();
    if (companyError) throw new Error("Não foi possível carregar a empresa.");
    setWorker({
      id: userId,
      name: profile.full_name,
      companyName: company.name,
      schedule: readSchedule(
        profile.work_schedule,
        defaultSchedule(
          profile.work_start ?? company.work_start,
          profile.work_end ?? company.work_end,
          profile.break_minutes ?? company.break_minutes,
        ),
      ),
      startDate: profile.employment_start,
    });
  }
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (data.user) await loadWorker(data.user.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível conectar."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!worker || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    let active = true;
    setLoadingEntries(true);
    setError("");
    setEntries([]);
    async function load() {
      const from = `${month}-01T00:00:00-03:00`;
      const [year = 0, number = 1] = month.split("-").map(Number);
      const next =
        new Date(Date.UTC(year, number, 2)).toISOString().slice(0, 10) + "T00:00:00-03:00";
      const { data: prior, error: priorError } = await supabase
        .from("time_entries")
        .select("id, event_type, recorded_at")
        .eq("user_id", worker!.id)
        .lt("recorded_at", from)
        .order("recorded_at", { ascending: false })
        .limit(1);
      if (priorError) throw priorError;
      const all: ClockEntry[] = prior?.[0]?.event_type === "clock_in" ? [...prior] : [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: queryError } = await supabase
          .from("time_entries")
          .select("id, event_type, recorded_at")
          .eq("user_id", worker!.id)
          .gte("recorded_at", from)
          .lt("recorded_at", next)
          .order("recorded_at")
          .order("id")
          .range(offset, offset + 999);
        if (queryError) throw queryError;
        all.push(...data);
        if (data.length < 1000) break;
      }
      if (active) setEntries(all);
    }
    load()
      .catch(() => {
        if (active) setError("Não foi possível carregar o mês. Tente atualizar novamente.");
      })
      .finally(() => {
        if (active) setLoadingEntries(false);
      });
    return () => {
      active = false;
    };
  }, [worker, month, refresh]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (authError || !data.user) throw new Error("E-mail ou senha incorretos.");
      await loadWorker(data.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await supabase.auth.signOut({ scope: "local" });
    setWorker(null);
    setEntries([]);
    setError("");
  }
  if (loading) return <BrandLoading label="Carregando seu acesso" />;
  if (!worker)
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#f5f5f7] p-6">
        <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
          <Link to="/" className="text-2xl font-semibold">
            <Brand />
          </Link>
          <p className="mt-10 text-xs font-bold tracking-widest text-blue-600">
            ACESSO DO FUNCIONÁRIO
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Seu ponto, organizado.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Consulte seus registros e saldo do mês. Para bater ponto, use o PIN no aparelho da
            empresa.
          </p>
          <form onSubmit={login} className="mt-7 space-y-4">
            <label className="block text-sm">
              E-mail
              <Input
                name="email"
                type="email"
                autoComplete="username"
                className="mt-2 h-12"
                required
              />
            </label>
            <label className="block text-sm">
              Senha
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-2 h-12"
                required
              />
            </label>
            <Button disabled={busy} className="h-12 w-full">
              {busy ? "Entrando..." : "Acessar meus registros"}
            </Button>
          </form>
          {error && (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <Link to="/" className="mt-6 block text-center text-sm text-muted-foreground">
            Voltar à página inicial
          </Link>
        </section>
      </main>
    );
  const summary = monthlySummary(entries, month, worker.schedule, worker.startDate);
  const today = localDate();
  return (
    <main className="min-h-svh bg-[#f5f5f7] px-5 py-7 text-[#1d1d1f]">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-black/10 pb-5">
          <Link to="/" className="text-2xl font-semibold">
            <Brand />
          </Link>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="size-4" /> Sair
          </Button>
        </header>
        <section className="py-10">
          <p className="text-sm font-semibold text-blue-600">{worker.companyName} · MEU PONTO</p>
          <h1 className="mt-3 text-4xl font-semibold">Olá, {worker.name.split(" ")[0]}.</h1>
          <p className="mt-3 text-muted-foreground">
            Sua jornada e seus registros, em um só lugar.
          </p>
          <div className="mt-7 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              Mês de referência
              <Input
                type="month"
                value={month}
                max={today.slice(0, 7)}
                className="mt-2 bg-white"
                onChange={(e) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={loadingEntries}
              onClick={() => setRefresh((old) => old + 1)}
            >
              Atualizar registros
            </Button>
          </div>
          {error ? (
            <p className="mt-6 rounded-2xl bg-red-50 p-5 text-red-700" role="alert">
              {error}
            </p>
          ) : loadingEntries ? (
            <p className="py-16" role="status">
              Carregando registros do mês...
            </p>
          ) : (
            <>
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Horas registradas", hours(summary.worked)],
                  ["Previstas nos dias apurados", hours(summary.expected)],
                  ["Saldo de horas extras", hours(summary.extra)],
                  ["Saldo de horas devidas", hours(summary.owed)],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-3xl bg-white p-6 shadow-sm">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Saldo estimado pelos dias encerrados e pela escala cadastrada, a partir de{" "}
                {new Date(`${worker.startDate}T12:00:00-03:00`).toLocaleDateString("pt-BR")}. Hoje e
                registros incompletos ficam pendentes. Feriados, férias e abonos ainda precisam de
                conferência com o responsável. Turnos que atravessam a meia-noite pertencem ao dia
                da entrada.
              </p>
              <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm">
                <h2 className="p-6 text-xl font-semibold">Registros do mês</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-[#eef2f7] text-muted-foreground">
                      <tr>
                        {[
                          "Dia",
                          "Jornada prevista",
                          "Marcações",
                          "Trabalhadas",
                          "Saldo / situação",
                        ].map((title) => (
                          <th key={title} className="px-5 py-4 font-medium">
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.days.map((day) => (
                        <tr key={day.date} className="border-t border-black/5">
                          <td className="px-5 py-4 font-semibold">
                            {new Date(`${day.date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              weekday: "short",
                              timeZone: "America/Sao_Paulo",
                            })}
                          </td>
                          <td className="px-5 py-4">
                            {day.expected ? (
                              <>
                                {day.plan.start}–{day.plan.end}
                                <span className="block text-xs text-muted-foreground">
                                  {hours(day.expected)} · pausa {day.plan.breakMinutes}min
                                </span>
                              </>
                            ) : day.date < worker.startDate ? (
                              "Antes do início"
                            ) : (
                              "Folga"
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {day.entries.length
                              ? day.entries.map((entry) => (
                                  <span key={entry.id} className="block whitespace-nowrap">
                                    {entry.event_type === "clock_in" ? "Entrada" : "Saída"}{" "}
                                    {new Date(entry.recorded_at).toLocaleTimeString("pt-BR", {
                                      timeZone: "America/Sao_Paulo",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ))
                              : "—"}
                          </td>
                          <td className="px-5 py-4 tabular-nums">{hours(day.worked)}</td>
                          <td className="px-5 py-4">
                            {day.pending
                              ? "Conferir marcações"
                              : day.date === today
                                ? "Hoje · parcial"
                                : day.date > today
                                  ? "Previsto"
                                  : !day.settled
                                    ? "—"
                                    : `${day.worked >= day.expected ? "+" : "−"}${hours(day.worked - day.expected)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
