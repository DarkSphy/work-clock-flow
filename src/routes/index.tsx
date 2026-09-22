import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Clock3, LogOut, Plus, Users, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { createEmployee } from "@/lib/employees.functions";

type SessionUser = { id: string; email: string | undefined };
type Profile = { user_id: string; company_id: string | null; full_name: string; job_title: string };
type Company = { id: string; name: string; workday_minutes: number; work_start: string; work_end: string; break_minutes: number };
type Entry = { id: string; event_type: "clock_in" | "clock_out"; recorded_at: string };
type Member = { user_id: string; full_name: string; job_title: string };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Simbi — Ponto simples para sua equipe" },
      { name: "description", content: "Registre jornadas, acompanhe sua equipe e calcule horas extras com a Simbi." },
      { property: "og:title", content: "Simbi — Ponto simples para sua equipe" },
      { property: "og:description", content: "Controle de ponto simples para pequenas empresas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(new Date());
  const [showTeam, setShowTeam] = useState(false);

  const loadWorkspace = useCallback(async (currentUser: SessionUser) => {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, company_id, full_name, job_title")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    const nextProfile = profileData as Profile | null;
    setProfile(nextProfile);
    if (!nextProfile?.company_id) {
      setLoading(false);
      return;
    }

    const [{ data: companyData }, { data: entryData }, { data: roleData }, { data: memberData }] = await Promise.all([
      supabase.from("companies").select("id, name, workday_minutes, work_start, work_end, break_minutes").eq("id", nextProfile.company_id).single(),
      supabase.from("time_entries").select("id, event_type, recorded_at").eq("user_id", currentUser.id).order("recorded_at", { ascending: false }).limit(90),
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id).eq("role", "admin").maybeSingle(),
      supabase.from("profiles").select("user_id, full_name, job_title").eq("company_id", nextProfile.company_id),
    ]);
    setCompany(companyData as Company | null);
    setEntries((entryData ?? []) as Entry[]);
    setIsAdmin(Boolean(roleData));
    setMembers((memberData ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const current = data.user ? { id: data.user.id, email: data.user.email } : null;
      setUser(current);
      if (current) loadWorkspace(current);
      else setLoading(false);
    });
  }, [loadWorkspace]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) return <AppBackdrop><div className="font-display text-3xl font-black">simbi</div></AppBackdrop>;
  if (!user) return <AuthScreen onSignedIn={(next) => { setUser(next); setLoading(true); loadWorkspace(next); }} />;
  if (!profile?.company_id) return <Onboarding user={user} profile={profile} onDone={() => loadWorkspace(user)} />;
  if (!company) return <AppBackdrop><p>Não foi possível carregar a empresa.</p></AppBackdrop>;

  const todayEntries = entries.filter((entry) => new Date(entry.recorded_at).toDateString() === clock.toDateString()).reverse();
  const isWorking = todayEntries.length % 2 === 1;
  const minutesToday = calculateWorkedMinutes(todayEntries, clock);
  const extraMinutes = calculateExtraMinutes(entries, company.workday_minutes);
  const firstEntry = todayEntries.find((entry) => entry.event_type === "clock_in");

  async function registerPoint() {
    if (!user || !company) return;
    setMessage("");
    const { error } = await supabase.from("time_entries").insert({
      company_id: company.id,
      user_id: user.id,
      event_type: isWorking ? "clock_out" : "clock_in",
    });
    if (error) setMessage("Não foi possível registrar agora. Tente novamente.");
    else {
      setMessage(isWorking ? "Saída registrada." : "Entrada registrada.");
      await loadWorkspace(user);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setCompany(null);
  }

  const hourBars = [38, 55, 82, 46, Math.min(100, 30 + Math.max(0, extraMinutes) / 3)];

  return (
    <AppBackdrop>
      <div className="relative mx-auto min-h-screen max-w-6xl px-5 py-6 lg:px-10 lg:py-8">
        <header className="flex items-center justify-between">
          <Brand />
          <nav className="flex items-center gap-2 sm:gap-5 text-sm font-medium text-muted-foreground">
            {isAdmin && <Button variant="ghost" onClick={() => setShowTeam(true)}><Users /> <span className="hidden sm:inline">Equipe</span></Button>}
            <span className="hidden md:inline">{company.name}</span>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" title="Sair"><LogOut /></Button>
          </nav>
        </header>

        <main className="mt-9 grid items-stretch gap-6 lg:mt-14 lg:grid-cols-12">
          <section className="flex flex-col justify-center lg:col-span-5">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-glass-border bg-glass px-3 py-1.5 text-xs font-semibold text-primary">
              <span className="status-pulse size-1.5 rounded-full bg-primary" />
              {formatLongDate(clock)}
            </div>
            <h1 className="mt-5 font-display text-5xl font-black leading-[0.92] sm:text-6xl">
              {greeting(clock)},<br />{firstName(profile.full_name)}.
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              {isWorking ? <>Você está em turno há <strong className="text-primary">{formatDuration(minutesToday)}</strong>.</> : "Seu ponto está pronto para começar."} A Simbi calcula seu saldo automaticamente.
            </p>

            <div className="glass-panel mt-8 rotate-[-1deg] rounded-2xl p-6">
              <div className="flex items-end justify-between gap-4">
                <div><Label>Horas hoje</Label><div className="font-display text-5xl font-black tabular-nums">{formatClock(minutesToday)}</div></div>
                <div className="text-right"><Label>Agora</Label><div className="text-lg font-bold tabular-nums">{clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-glass"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (minutesToday / company.workday_minutes) * 100)}%` }} /></div>
              <Button variant="kinetic" size="punch" className="mt-5 w-full" onClick={registerPoint}>{isWorking ? "Registrar saída" : "Registrar entrada"}</Button>
              {message && <p className="mt-3 text-center text-xs text-primary" role="status">{message}</p>}
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
            <div className="glass-panel flex flex-col rounded-2xl p-6 sm:rotate-[1deg]">
              <div className="flex items-center justify-between"><Label>Registros de hoje</Label><span className="text-xs font-bold text-primary">{todayEntries.length} marcações</span></div>
              <div className="mt-5 space-y-3">
                {todayEntries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro hoje.</p>}
                {todayEntries.map((entry) => <div key={entry.id} className="flex items-center gap-3 border-b border-glass-border pb-3">
                  <span className="grid size-8 place-items-center rounded-full bg-glass text-primary"><Clock3 className="size-4" /></span>
                  <div className="flex-1"><div className="text-sm font-bold">{entry.event_type === "clock_in" ? "Entrada" : "Saída"}</div><div className="text-[11px] text-muted-foreground">Registrado com sucesso</div></div>
                  <span className="font-bold tabular-nums">{formatTime(entry.recorded_at)}</span>
                </div>)}
              </div>
            </div>

            <div className="glass-panel flex flex-col rounded-2xl p-6 sm:rotate-[-1deg]">
              <div className="flex items-center justify-between"><Label>Horas extras</Label><span className="text-xs font-bold text-primary">{formatSigned(extraMinutes)}</span></div>
              <div className="mt-5 flex h-24 items-end gap-1.5">{hourBars.map((height, index) => <div key={index} className={index > 1 ? "flex-1 rounded-t-md bg-primary" : "flex-1 rounded-t-md bg-glass"} style={{ height: `${height}%` }} />)}</div>
              <div className="mt-3 flex justify-between text-[10px] uppercase text-muted-foreground"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span></div>
              <div className="mt-4 border-t border-glass-border pt-4 text-sm text-muted-foreground">Saldo acumulado: <strong className="text-foreground">{formatSigned(extraMinutes)}</strong>.</div>
            </div>
          </section>
        </main>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <Summary icon={<Building2 />} label="Empresa" value={company.name} detail={`${members.length} ${members.length === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}`} />
          <Summary icon={<Clock3 />} label="Expediente" value={`${company.work_start.slice(0, 5)} – ${company.work_end.slice(0, 5)}`} detail={`${company.break_minutes / 60}h de intervalo`} tilt="sm:rotate-[-0.6deg]" />
          <Summary icon={<Users />} label="Meu saldo" value={formatSigned(extraMinutes)} detail="horas extras acumuladas" tilt="sm:rotate-[0.6deg]" />
        </section>
      </div>
      {showTeam && <TeamDialog members={members} onClose={() => setShowTeam(false)} onCreated={() => user && loadWorkspace(user)} />}
    </AppBackdrop>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")); const password = String(form.get("password"));
    if (mode === "signup") {
      const fullName = String(form.get("fullName"));
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
      if (error) setNotice(error.message);
      else if (!data.session) setNotice("Confira seu e-mail para confirmar o acesso.");
      else if (data.user) onSignedIn({ id: data.user.id, email: data.user.email });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setNotice("E-mail ou senha incorretos.");
      else if (data.user) onSignedIn({ id: data.user.id, email: data.user.email });
    }
    setBusy(false);
  }

  async function googleSignIn() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) setNotice("Não foi possível entrar com o Google.");
    if (!result.redirected) {
      const { data } = await supabase.auth.getUser();
      if (data.user) onSignedIn({ id: data.user.id, email: data.user.email });
    }
    setBusy(false);
  }

  return <AppBackdrop><main className="relative mx-auto flex min-h-screen max-w-6xl items-center px-5 py-10"><div className="grid w-full items-center gap-12 lg:grid-cols-2">
    <section><Brand /><h1 className="mt-10 font-display text-5xl font-black leading-[0.94] sm:text-7xl">Ponto simples.<br /><span className="text-primary">Equipe em sintonia.</span></h1><p className="mt-5 max-w-md text-lg text-muted-foreground">Organize a jornada, acompanhe as horas extras e dê autonomia para cada pessoa registrar seu horário.</p></section>
    <section className="glass-panel mx-auto w-full max-w-md rounded-2xl p-6 sm:p-8"><h2 className="font-display text-2xl font-black">{mode === "signin" ? "Entrar na Simbi" : "Criar sua empresa"}</h2><p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Use seu acesso para registrar o ponto." : "Comece com seu perfil de administrador."}</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>{mode === "signup" && <Field label="Seu nome" name="fullName" placeholder="Nome completo" />}<Field label="E-mail" name="email" type="email" placeholder="voce@empresa.com" /><Field label="Senha" name="password" type="password" placeholder="Mínimo de 8 caracteres" minLength={8} /><Button variant="kinetic" size="punch" className="w-full" disabled={busy}>{busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}</Button></form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-glass-border" />ou<span className="h-px flex-1 bg-glass-border" /></div><Button variant="glass" className="h-11 w-full" onClick={googleSignIn} disabled={busy}>Continuar com Google</Button>
      {notice && <p className="mt-4 text-center text-sm text-primary" role="status">{notice}</p>}<Button variant="ghost" className="mt-5 w-full text-muted-foreground" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }}>{mode === "signin" ? "Ainda não tem conta? Criar empresa" : "Já tem conta? Entrar"}</Button>
    </section>
  </div></main></AppBackdrop>;
}

function Onboarding({ user, profile, onDone }: { user: SessionUser; profile: Profile | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName")); const companyName = String(form.get("companyName"));
    const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName, job_title: "Administrador" }).eq("user_id", user.id);
    if (profileError) { setError("Não foi possível salvar seu perfil."); setBusy(false); return; }
    const { error: companyError } = await supabase.from("companies").insert({ name: companyName, owner_id: user.id });
    if (companyError) setError("Não foi possível criar a empresa."); else await onDone(); setBusy(false);
  }
  return <AppBackdrop><main className="relative mx-auto flex min-h-screen max-w-xl items-center px-5"><section className="glass-panel w-full rounded-2xl p-7"><Brand /><h1 className="mt-8 font-display text-4xl font-black">Vamos preparar a Simbi.</h1><p className="mt-2 text-muted-foreground">Cadastre os dados básicos da empresa para começar.</p><form className="mt-7 space-y-4" onSubmit={submit}><Field label="Seu nome" name="fullName" defaultValue={profile?.full_name ?? ""} /><Field label="Nome da empresa" name="companyName" placeholder="Ex.: Padaria Aurora" /><Button variant="kinetic" size="punch" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar empresa"}</Button></form>{error && <p className="mt-4 text-sm text-warning">{error}</p>}</section></main></AppBackdrop>;
}

function TeamDialog({ members, onClose, onCreated }: { members: Member[]; onClose: () => void; onCreated: () => void }) {
  const createEmployeeFn = useServerFn(createEmployee); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); try { await createEmployeeFn({ data: { fullName: String(form.get("fullName")), jobTitle: String(form.get("jobTitle")), email: String(form.get("email")), password: String(form.get("password")) } }); setMessage("Funcionário cadastrado com sucesso."); event.currentTarget.reset(); onCreated(); } catch { setMessage("Não foi possível cadastrar. Confira o e-mail e tente novamente."); } setBusy(false); }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-md"><section className="glass-panel max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl p-6"><div className="flex items-start justify-between"><div><Label>Equipe</Label><h2 className="mt-1 font-display text-3xl font-black">Pessoas e acessos</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X /></Button></div><div className="mt-6 grid gap-7 md:grid-cols-2"><div><h3 className="font-bold">Cadastrados</h3><div className="mt-3 space-y-2">{members.map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-xl bg-glass p-3"><div className="grid size-9 place-items-center rounded-full bg-primary/20 text-xs font-black text-primary">{initials(member.full_name)}</div><div><p className="text-sm font-bold">{member.full_name || "Sem nome"}</p><p className="text-xs text-muted-foreground">{member.job_title || "Funcionário"}</p></div></div>)}</div></div><form onSubmit={submit} className="space-y-3"><h3 className="font-bold">Novo funcionário</h3><Field label="Nome" name="fullName" /><Field label="Cargo" name="jobTitle" /><Field label="E-mail de acesso" name="email" type="email" /><Field label="Senha inicial" name="password" type="password" minLength={8} /><Button variant="kinetic" className="w-full" disabled={busy}><Plus />{busy ? "Cadastrando..." : "Cadastrar funcionário"}</Button>{message && <p className="text-sm text-primary" role="status">{message}</p>}</form></div></section></div>;
}

function AppBackdrop({ children }: { children: React.ReactNode }) { return <div className="relative min-h-screen overflow-hidden bg-background text-foreground"><div className="ambient-drift pointer-events-none absolute -left-40 -top-40 size-[620px] rounded-full bg-primary/20 blur-[120px]" /><div className="ambient-drift-back pointer-events-none absolute right-[-160px] top-1/3 size-[560px] rounded-full bg-secondary/30 blur-[130px]" />{children}</div>; }
function Brand() { return <div className="flex items-center gap-3"><div className="grid size-10 rotate-[-8deg] place-items-center rounded-xl bg-primary font-display text-lg font-black text-primary-foreground shadow-[var(--shadow-glow)]">S</div><div className="leading-none"><div className="font-display text-xl font-black">simbi</div><div className="mt-1 text-[9px] uppercase tracking-[0.22em] text-muted-foreground">ponto em sintonia</div></div></div>; }
function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) { return <label className="block text-xs font-semibold text-muted-foreground">{label}<Input className="mt-1.5 h-11 border-glass-border bg-glass text-foreground placeholder:text-muted-foreground focus-visible:ring-primary" required {...props} /></label>; }
function Label({ children }: { children: React.ReactNode }) { return <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</div>; }
function Summary({ icon, label, value, detail, tilt = "sm:rotate-[0.6deg]" }: { icon: React.ReactNode; label: string; value: string; detail: string; tilt?: string }) { return <div className={`rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur-xl ${tilt}`}><div className="flex items-center gap-2 text-muted-foreground">{icon}<Label>{label}</Label></div><div className="mt-2 truncate font-display text-xl font-extrabold">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>; }
function firstName(name: string) { return name.trim().split(" ")[0] || "Olá"; }
function initials(name: string) { return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S"; }
function greeting(date: Date) { const hour = date.getHours(); return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"; }
function formatLongDate(date: Date) { const text = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(date); return text.charAt(0).toUpperCase() + text.slice(1); }
function formatTime(value: string) { return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function formatClock(minutes: number) { const safe = Math.max(0, Math.floor(minutes)); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function formatDuration(minutes: number) { return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}min`; }
function formatSigned(minutes: number) { const sign = minutes >= 0 ? "+" : "−"; return `${sign}${Math.floor(Math.abs(minutes) / 60)}h ${Math.abs(Math.floor(minutes)) % 60}m`; }
function calculateWorkedMinutes(entries: Entry[], now: Date) { let total = 0; let start: Date | null = null; for (const entry of entries) { if (entry.event_type === "clock_in") start = new Date(entry.recorded_at); else if (start) { total += new Date(entry.recorded_at).getTime() - start.getTime(); start = null; } } if (start) total += now.getTime() - start.getTime(); return total / 60000; }
function calculateExtraMinutes(entries: Entry[], target: number) { const grouped = new Map<string, Entry[]>(); for (const entry of [...entries].reverse()) { const key = new Date(entry.recorded_at).toDateString(); grouped.set(key, [...(grouped.get(key) ?? []), entry]); } let balance = 0; for (const dayEntries of grouped.values()) balance += calculateWorkedMinutes(dayEntries, new Date()) - target; return Math.round(balance); }