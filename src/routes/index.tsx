import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, Building2, CalendarDays, Check, ChevronRight, Clock3, Copy, Link2, LogOut, Pencil, Plus, ShieldCheck, Smartphone, Trash2, Users, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from "@/lib/employees.functions";

type SessionUser = { id: string; email: string | undefined };
type Profile = { user_id: string; company_id: string | null; full_name: string; job_title: string; work_start: string | null; work_end: string | null; break_minutes: number | null };
type Company = { id: string; name: string; workday_minutes: number; work_start: string; work_end: string; break_minutes: number };
type Entry = { id: string; user_id: string; event_type: "clock_in" | "clock_out"; recorded_at: string };
type Member = { user_id: string; full_name: string; job_title: string; email?: string; work_start?: string | null; work_end?: string | null; break_minutes?: number | null };

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
      .select("user_id, company_id, full_name, job_title, work_start, work_end, break_minutes")
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
      supabase.from("time_entries").select("id, user_id, event_type, recorded_at").eq("company_id", nextProfile.company_id).order("recorded_at", { ascending: false }).limit(1000),
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id).eq("role", "admin").maybeSingle(),
      supabase.from("profiles").select("user_id, full_name, job_title, work_start, work_end, break_minutes").eq("company_id", nextProfile.company_id),
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

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen onSignedIn={(next) => { setUser(next); setLoading(true); loadWorkspace(next); }} />;
  if (!profile?.company_id) return <Onboarding user={user} profile={profile} onDone={() => loadWorkspace(user)} />;
  if (!company) return <AppBackdrop><p>Não foi possível carregar a empresa.</p></AppBackdrop>;

  if (isAdmin) return <CompanyDashboard company={company} members={members.filter((member) => member.user_id !== user.id)} entries={entries} clock={clock} onSignOut={signOut} onCreated={() => loadWorkspace(user)} />;

  const todayEntries = entries.filter((entry) => entry.user_id === user.id && new Date(entry.recorded_at).toDateString() === clock.toDateString()).reverse();
  const isWorking = todayEntries.length % 2 === 1;
  const minutesToday = calculateWorkedMinutes(todayEntries, clock);
  const scheduledMinutes = scheduleMinutes(profile.work_start, profile.work_end, profile.break_minutes, company);
  const extraMinutes = calculateExtraMinutes(entries.filter((entry) => entry.user_id === user.id), scheduledMinutes);
  const firstEntry = todayEntries.find((entry) => entry.event_type === "clock_in");

  async function registerPoint() {
    if (!user || !company || isAdmin) return;
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
      <div className="relative mx-auto min-h-screen max-w-7xl px-5 py-6 lg:px-8 lg:py-7">
        <header className="flex items-center justify-between border-b border-black/[.07] pb-5">
          <Brand />
          <nav className="flex items-center gap-2 sm:gap-5 text-sm font-medium text-muted-foreground">
            {isAdmin && <Button variant="ghost" onClick={() => setShowTeam(true)}><Users /> <span className="hidden sm:inline">Equipe</span></Button>}
            <span className="hidden md:inline">{company.name}</span>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" title="Sair"><LogOut /></Button>
          </nav>
        </header>

        <main className="mt-10 grid items-stretch gap-6 lg:mt-14 lg:grid-cols-12">
          <section className="flex flex-col justify-center lg:col-span-5">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-[#0066cc]/15 bg-[#eaf3ff] px-3 py-1.5 text-xs font-semibold text-[#0066cc]">
              <span className="status-pulse size-1.5 rounded-full bg-[#0066cc]" />
              {formatLongDate(clock)}
            </div>
            <h1 className="mt-5 font-display text-5xl font-black leading-[0.92] sm:text-6xl">
              {greeting(clock)},<br />{firstName(profile.full_name)}.
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              {isWorking ? <>Você está em turno há <strong className="text-primary">{formatDuration(minutesToday)}</strong>.</> : "Seu ponto está pronto para começar."} A Simbi calcula seu saldo automaticamente.
            </p>

            <div className="glass-panel mt-8 rounded-[28px] p-6">
              <div className="flex items-end justify-between gap-4">
                <div><Label>Horas hoje</Label><div className="font-display text-5xl font-black tabular-nums">{formatClock(minutesToday)}</div></div>
                <div className="text-right"><Label>Agora</Label><div className="text-lg font-bold tabular-nums">{clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-glass"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (minutesToday / scheduledMinutes) * 100)}%` }} /></div>
              <Button variant="kinetic" size="punch" className="mt-5 w-full" onClick={registerPoint}>{isWorking ? "Registrar saída" : "Registrar entrada"}</Button>
              {message && <p className="mt-3 text-center text-xs text-primary" role="status">{message}</p>}
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
            <div className="glass-panel flex flex-col rounded-[28px] p-6">
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

            <div className="glass-panel flex flex-col rounded-[28px] p-6">
              <div className="flex items-center justify-between"><Label>Horas extras</Label><span className="text-xs font-bold text-primary">{formatSigned(extraMinutes)}</span></div>
              <div className="mt-5 flex h-24 items-end gap-1.5">{hourBars.map((height, index) => <div key={index} className={index > 1 ? "flex-1 rounded-t-md bg-primary" : "flex-1 rounded-t-md bg-glass"} style={{ height: `${height}%` }} />)}</div>
              <div className="mt-3 flex justify-between text-[10px] uppercase text-muted-foreground"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span></div>
              <div className="mt-4 border-t border-glass-border pt-4 text-sm text-muted-foreground">Saldo acumulado: <strong className="text-foreground">{formatSigned(extraMinutes)}</strong>.</div>
            </div>
          </section>
        </main>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <Summary icon={<Building2 />} label="Empresa" value={company.name} detail={`${members.length} ${members.length === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}`} />
          <Summary icon={<Clock3 />} label="Meu expediente" value={`${(profile.work_start ?? company.work_start).slice(0, 5)} – ${(profile.work_end ?? company.work_end).slice(0, 5)}`} detail={`${(profile.break_minutes ?? company.break_minutes) / 60}h de intervalo`} tilt="sm:rotate-[-0.6deg]" />
          <Summary icon={<Users />} label="Meu saldo" value={formatSigned(extraMinutes)} detail="horas extras acumuladas" tilt="sm:rotate-[0.6deg]" />
        </section>
      </div>
      {showTeam && <TeamDialog members={members} onClose={() => setShowTeam(false)} onCreated={() => user && loadWorkspace(user)} />}
    </AppBackdrop>
  );
}

function CompanyDashboard({ company, members, entries, clock, onSignOut, onCreated }: { company: Company; members: Member[]; entries: Entry[]; clock: Date; onSignOut: () => void; onCreated: () => void }) {
  const [showTeam, setShowTeam] = useState(false); const [copied, setCopied] = useState(false);
  const today = entries.filter((entry) => new Date(entry.recorded_at).toDateString() === clock.toDateString());
  const working = members.filter((member) => today.filter((entry) => entry.user_id === member.user_id).length % 2 === 1);
  const totalToday = members.reduce((sum, member) => sum + calculateWorkedMinutes(today.filter((entry) => entry.user_id === member.user_id).reverse(), clock), 0);
  const accessLink = `${window.location.origin}/?empresa=${encodeURIComponent(company.id)}`;
  async function copyAccessLink() { await navigator.clipboard.writeText(accessLink); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
  return <AppBackdrop><div className="relative mx-auto min-h-screen max-w-7xl px-5 py-6 lg:px-8 lg:py-7">
    <header className="flex items-center justify-between border-b border-black/[.07] pb-5"><Brand /><div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:inline">{company.name}</span><Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sair"><LogOut /></Button></div></header>
    <main className="py-10 lg:py-14"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm font-semibold text-[#0066cc]">PAINEL DA EMPRESA</p><h1 className="mt-3 font-display text-4xl font-black tracking-[-.045em] sm:text-6xl">Sua equipe em tempo real.</h1><p className="mt-3 text-muted-foreground">{formatLongDate(clock)} · {company.name}</p></div><Button variant="kinetic" onClick={() => setShowTeam(true)}><Plus /> Adicionar funcionário</Button></div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3"><Summary icon={<Users />} label="Funcionários" value={String(members.length)} detail="pessoas cadastradas" /><Summary icon={<Clock3 />} label="Em expediente" value={String(working.length)} detail="com ponto aberto agora" /><Summary icon={<Building2 />} label="Horas registradas hoje" value={formatClock(totalToday)} detail="somadas para toda a equipe" /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_.75fr]"><section className="glass-panel rounded-[28px] p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><div><Label>Equipe</Label><h2 className="mt-2 font-display text-2xl font-black tracking-tight">Ponto e horários</h2></div><Button variant="glass" onClick={() => setShowTeam(true)}>Gerenciar</Button></div>{members.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Cadastre o primeiro funcionário para acompanhar os horários aqui.</p> : <div className="mt-6 space-y-2">{members.map((member) => { const memberToday = today.filter((entry) => entry.user_id === member.user_id); const latest = memberToday[0]; const open = memberToday.length % 2 === 1; const target = scheduleMinutes(member.work_start, member.work_end, member.break_minutes, company); const balance = calculateExtraMinutes(entries.filter((entry) => entry.user_id === member.user_id), target); const start = (member.work_start ?? company.work_start).slice(0, 5); const now = clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); const late = !open && memberToday.length === 0 && now > start; return <div key={member.user_id} className="grid gap-3 rounded-2xl border border-black/[.06] bg-white p-4 sm:grid-cols-[1.45fr_1fr_1fr_1fr] sm:items-center"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-full bg-[#eaf3ff] text-xs font-black text-[#0066cc]">{initials(member.full_name)}</div><div><p className="font-bold">{member.full_name}</p><p className="text-xs text-muted-foreground">{member.job_title || "Funcionário"} · {start}–{(member.work_end ?? company.work_end).slice(0, 5)}</p></div></div><div><Label>Situação</Label><p className={open ? "font-semibold text-[#15704a]" : late ? "font-semibold text-[#d97706]" : "font-semibold text-muted-foreground"}>{open ? "Em expediente" : late ? "Sem entrada" : "Fora do expediente"}</p></div><div><Label>Último registro</Label><p className="font-semibold">{latest ? `${latest.event_type === "clock_in" ? "Entrada" : "Saída"} · ${formatTime(latest.recorded_at)}` : late ? "Alerta: atraso" : "Sem registro hoje"}</p></div><div><Label>Hoje · saldo</Label><p className="font-semibold tabular-nums">{formatClock(calculateWorkedMinutes([...memberToday].reverse(), clock))} · {formatSigned(balance)}</p></div></div>; })}</div>}</section>
        <aside className="space-y-6"><section className="rounded-[28px] bg-[#1d1d1f] p-6 text-white"><Link2 className="size-6 text-[#2997ff]" /><p className="mt-8 text-sm font-semibold text-white/55">ACESSO DA EQUIPE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Um link para entrar na Simbi.</h2><p className="mt-3 text-sm leading-relaxed text-white/60">Compartilhe com funcionários já cadastrados. Cada pessoa entra usando seu próprio e-mail e senha.</p><div className="mt-6 overflow-hidden rounded-xl bg-white/10 px-3 py-3 text-xs text-white/70">{accessLink}</div><button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-[#1d1d1f]" onClick={copyAccessLink}><Copy className="size-4" />{copied ? "Link copiado" : "Copiar link de acesso"}</button></section><section className="glass-panel rounded-[28px] p-6"><Label>Resumo do dia</Label><div className="mt-6 flex h-24 items-end gap-2">{[42, 66, 52, 85, 74, 92, 68].map((height, index) => <div key={index} className="flex-1 rounded-t-md bg-[#0071e3]" style={{ height: `${height}%`, opacity: .35 + index / 15 }} />)}</div><div className="mt-4 flex justify-between text-[10px] text-muted-foreground"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div><p className="mt-6 border-t border-black/[.08] pt-5 text-sm text-muted-foreground">Acompanhe as horas registradas e intervenha antes do fechamento.</p></section></aside></div>
    </main></div>{showTeam && <TeamDialog members={members} onClose={() => setShowTeam(false)} onCreated={onCreated} />}</AppBackdrop>;
}

function AuthScreen({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  function openAuth(nextMode: "signin" | "signup") { setMode(nextMode); setNotice(""); setShowAuth(true); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")); const password = String(form.get("password"));
    if (mode === "signup") {
      const fullName = String(form.get("fullName"));
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
      if (error) setNotice(error.message);
      else if (!data.session) { setMode("signin"); setNotice(`Conta criada com sucesso! Abra o e-mail enviado para ${email} e confirme seu acesso. Depois, volte aqui para entrar.`); }
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

  return <div className="marketing min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fbfbfd]/90 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 lg:px-8"><Brand /><nav className="hidden items-center gap-8 text-xs font-medium text-black/70 md:flex"><a href="#produto">Produto</a><a href="#recursos">Recursos</a><a href="#seguranca">Segurança</a><a href="#precos">Preço</a></nav><div className="flex items-center gap-3"><button className="text-sm font-medium" onClick={() => openAuth("signin")}>Entrar</button><button className="rounded-full bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0077ed]" onClick={() => openAuth("signup")}>Começar</button></div></div></header>

    <main>
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-20 text-center sm:pt-28 lg:px-8"><p className="mb-5 text-sm font-semibold tracking-wide text-[#0066cc]">SIMBI PARA EMPRESAS</p><h1 className="mx-auto max-w-5xl text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-7xl lg:text-[92px]">O tempo da sua equipe.<br />Finalmente em sintonia.</h1><p className="mx-auto mt-7 max-w-2xl text-balance text-xl leading-relaxed text-[#6e6e73] sm:text-2xl">Ponto, jornada e gestão reunidos em uma experiência que todo mundo entende de primeira.</p><div className="mt-9 flex flex-wrap justify-center gap-4"><button className="rounded-full bg-[#0071e3] px-7 py-3.5 text-base font-semibold text-white hover:bg-[#0077ed]" onClick={() => openAuth("signup")}>Começar grátis</button><a className="group inline-flex items-center gap-1 rounded-full px-6 py-3.5 text-base font-semibold text-[#0066cc]" href="#produto">Conhecer a Simbi <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" /></a></div></section>

      <section id="produto" className="mx-auto max-w-[1440px] px-3 sm:px-6"><div className="overflow-hidden rounded-[28px] bg-white"><img className="h-[430px] w-full object-cover sm:h-[620px] lg:h-[760px]" src="/images/simbi-workplace-hero.webp" alt="Celular e notebook mostrando a gestão de jornada da Simbi" /></div></section>

      <Reveal><section className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-20 text-center md:grid-cols-4 md:py-28"><Metric target={10} suffix="s" label="para registrar o ponto" /><Metric target={24} suffix="/7" label="visão da jornada" /><Metric target={100} suffix="%" label="em nuvem" /><Metric target={1} suffix=" só lugar" label="para toda a operação" /></section></Reveal>

      <section id="recursos" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24"><p className="text-sm font-semibold text-[#0066cc]">FEITO PARA SER SIMPLES</p><h2 className="mt-4 max-w-4xl text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">Menos controle manual.<br /><span className="text-[#86868b]">Mais clareza para decidir.</span></h2><div className="mt-14 grid gap-5 lg:grid-cols-2">
        <FeatureCard className="bg-white" icon={<Smartphone />} eyebrow="Para o funcionário" title="Bater o ponto é só o começo." text="Uma tela direta, saldo atualizado e histórico claro. Sem treinamento, sem dúvida e sem planilha." visual={<ProductPhone />} />
        <FeatureCard className="bg-[#1d1d1f] text-white lg:col-span-2" icon={<BarChart3 />} eyebrow="Para a gestão" title="A empresa inteira. Em um olhar." text="Acompanhe quem está trabalhando, horas do dia, saldos e exceções sem perseguir informação." dark visual={<ManagementPreview />} />
        <FeatureCard className="bg-[#eaf3ff] lg:col-span-2" icon={<CalendarDays />} eyebrow="Tudo conectado" title="Do primeiro registro ao fechamento do mês." text="Jornadas, intervalos, horas extras, ausências e relatórios preparados para um fechamento sem surpresas." visual={<div className="mt-12 grid gap-3 sm:grid-cols-4">{["Ponto em tempo real", "Banco de horas", "Alertas inteligentes", "Relatórios prontos"].map((item) => <div key={item} className="rounded-2xl bg-white/80 p-5 text-sm font-semibold shadow-sm"><Check className="mb-8 size-5 text-[#0071e3]" />{item}</div>)}</div>} />
      </div></section>

      <Reveal><section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-32"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div className="lg:sticky lg:top-28"><p className="text-sm font-semibold text-[#0066cc]">DA ENTRADA AO FECHAMENTO</p><h2 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">Uma jornada clara para todo mundo.</h2><p className="mt-6 max-w-lg text-lg leading-relaxed text-[#6e6e73]">A Simbi organiza cada etapa do ponto sem transformar a rotina em burocracia. A equipe registra. A gestão acompanha. O fechamento chega pronto.</p></div><div className="space-y-4">{[
        ["01", "Cadastre a equipe", "Crie acessos individuais, defina cargos e mantenha cada colaborador ligado à empresa certa."],
        ["02", "Acompanhe o dia", "Veja entradas, saídas, pessoas em expediente e horas acumuladas enquanto o trabalho acontece."],
        ["03", "Cuide das exceções", "Identifique atrasos, intervalos incompletos e jornadas fora do previsto antes que virem problema."],
        ["04", "Feche com confiança", "Consolide banco de horas e relatórios em uma visão limpa, pronta para apoiar a folha."],
      ].map(([number, title, text]) => <article key={number} className="group rounded-[28px] border border-black/[.06] bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-9"><div className="flex gap-6"><span className="text-sm font-semibold text-[#0066cc]">{number}</span><div><h3 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h3><p className="mt-3 max-w-xl leading-relaxed text-[#6e6e73]">{text}</p></div></div></article>)}</div></div></section></Reveal>

      <section className="bg-[#101014] py-24 text-white sm:py-32"><div className="mx-auto max-w-7xl px-5 lg:px-8"><Reveal><div className="max-w-4xl"><p className="text-sm font-semibold text-[#2997ff]">PROFUNDIDADE SEM COMPLICAÇÃO</p><h2 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">Tudo que a gestão precisa.<br /><span className="text-white/40">Nada que atrapalhe o trabalho.</span></h2></div></Reveal><div className="mt-14 grid gap-px overflow-hidden rounded-[30px] bg-white/10 md:grid-cols-2 lg:grid-cols-3">{[
        ["Ponto em tempo real", "Saiba quem já entrou, quem está em intervalo e quem encerrou a jornada."],
        ["Banco de horas", "Saldos positivos e negativos calculados a partir da jornada de cada pessoa."],
        ["Horários e escalas", "Organize expedientes, intervalos e diferentes rotinas no mesmo ambiente."],
        ["Alertas úteis", "Encontre registros incompletos e variações que realmente pedem atenção."],
        ["Gestão de acessos", "Edite dados, redefina senhas e remova acessos com controle administrativo."],
        ["Histórico confiável", "Consulte registros por dia e por pessoa com uma linha do tempo fácil de entender."],
      ].map(([title, text], index) => <Reveal key={title} delay={index * 60}><article className="min-h-64 bg-[#101014] p-8 sm:p-10"><span className="text-sm text-white/35">0{index + 1}</span><h3 className="mt-12 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-4 leading-relaxed text-white/55">{text}</p></article></Reveal>)}</div></div></section>

      <Reveal><section className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32"><div className="text-center"><p className="text-sm font-semibold text-[#0066cc]">CABE NA SUA ROTINA</p><h2 className="mx-auto mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Do escritório à equipe em campo.</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#6e6e73]">Uma base simples o bastante para começar hoje e flexível para acompanhar novas unidades, funções e formas de trabalhar.</p></div><div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Escritórios", "Jornadas previsíveis e uma visão rápida do time."], ["Comércio", "Turnos, intervalos e operação acontecendo ao mesmo tempo."], ["Serviços", "Equipes pequenas com gestão direta e sem planilhas."], ["Campo", "Acesso fácil pelo celular onde o trabalho acontece."],
      ].map(([title, text]) => <article key={title} className="rounded-[26px] bg-white p-7"><div className="grid size-11 place-items-center rounded-full bg-[#eaf3ff] text-[#0066cc]"><Building2 className="size-5" /></div><h3 className="mt-10 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-[#6e6e73]">{text}</p></article>)}</div></section></Reveal>

      <section id="seguranca" className="bg-white py-24 sm:py-32"><div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2"><div><ShieldCheck className="size-12 text-[#0071e3]" /><h2 className="mt-7 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl">Privacidade no centro. Desde o primeiro ponto.</h2><p className="mt-6 max-w-xl text-lg leading-relaxed text-[#6e6e73]">Cada empresa acessa somente sua própria equipe. Perfis separados para gestores e funcionários, regras de acesso no banco e histórico protegido na nuvem.</p></div><div className="rounded-[32px] bg-[#f5f5f7] p-8 sm:p-12"><p className="text-sm font-semibold text-[#0066cc]">SEGURANÇA SIMBI</p>{["Dados isolados por empresa", "Permissões por função", "Autenticação protegida", "Backups e disponibilidade"].map((item, index) => <div key={item} className="flex items-center justify-between border-b border-black/10 py-6 text-lg font-semibold"><span>{item}</span><span className="text-sm text-[#86868b]">0{index + 1}</span></div>)}</div></div></section>

      <Reveal><section id="precos" className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32"><div className="overflow-hidden rounded-[36px] bg-[#dff3ff] px-7 py-12 sm:px-12 lg:px-16 lg:py-16"><div className="grid gap-12 lg:grid-cols-[1fr_.8fr] lg:items-center"><div><p className="text-sm font-semibold text-[#0066cc]">PREÇO SIMPLES. PARA SEMPRE.</p><h2 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">Um único valor.<br />Nenhuma surpresa.</h2><p className="mt-6 max-w-xl text-lg leading-relaxed text-[#51606c]">Acesso completo para organizar sua empresa. O preço que você contrata permanece o mesmo, sem mudança de plano no caminho.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{["Painel completo da empresa", "Acesso individual da equipe", "Registros e banco de horas", "Atualizações incluídas"].map((item) => <div key={item} className="flex items-center gap-3 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-full bg-white"><Check className="size-3.5 text-[#0066cc]" /></span>{item}</div>)}</div></div><div className="rounded-[30px] bg-white p-7 shadow-[0_30px_80px_rgba(0,70,130,.14)] sm:p-9"><p className="text-sm font-semibold text-[#6e6e73]">SIMBI COMPLETA</p><div className="mt-7 flex items-start gap-1"><span className="mt-3 text-xl font-semibold">R$</span><span className="text-7xl font-semibold tracking-[-0.07em] sm:text-8xl">39</span><div className="mt-3"><span className="text-2xl font-semibold">,90</span><p className="text-sm text-[#6e6e73]">por mês</p></div></div><div className="my-7 h-px bg-black/10" /><p className="font-semibold">Seu valor fica protegido.</p><p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">R$ 39,90 é o valor único da assinatura e não aumenta enquanto ela permanecer ativa.</p><button className="mt-8 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#0071e3] px-6 font-semibold text-white hover:bg-[#0077ed]" onClick={() => openAuth("signup")}>Começar agora <ArrowRight className="size-4" /></button><p className="mt-4 text-center text-xs text-[#86868b]">Cancele quando quiser.</p></div></div></div></section></Reveal>

      <section className="bg-white py-24 sm:py-32"><div className="mx-auto max-w-4xl px-6"><p className="text-center text-sm font-semibold text-[#0066cc]">PERGUNTAS FREQUENTES</p><h2 className="mt-4 text-center text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Antes de começar.</h2><div className="mt-14 divide-y divide-black/10 border-y border-black/10">{[
        ["Preciso instalar algum programa?", "Não. A Simbi funciona no navegador do computador e do celular, sem instalação para começar."],
        ["Funcionários enxergam o painel da empresa?", "Não. Cada perfil tem sua própria experiência. A gestão acompanha a operação e o funcionário acessa somente seus registros."],
        ["Posso alterar os dados da minha equipe?", "Sim. O painel permite editar nome, cargo, e-mail, senha de acesso e remover um funcionário quando necessário."],
        ["O preço de R$ 39,90 pode aumentar?", "O valor contratado permanece em R$ 39,90 enquanto a assinatura estiver ativa."],
      ].map(([question, answer]) => <details key={question} className="group py-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-semibold"><span>{question}</span><Plus className="size-5 shrink-0 transition-transform group-open:rotate-45" /></summary><p className="max-w-2xl pt-4 leading-relaxed text-[#6e6e73]">{answer}</p></details>)}</div></div></section>

      <section id="empresas" className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32"><div className="overflow-hidden rounded-[32px] bg-[#1d1d1f] px-7 py-16 text-center text-white sm:px-14 sm:py-24"><p className="text-sm font-semibold text-white/60">COMECE HOJE</p><h2 className="mx-auto mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-7xl">Uma rotina mais leve começa com um ponto mais simples.</h2><p className="mx-auto mt-6 max-w-xl text-lg text-white/60">Configure sua empresa, convide a equipe e acompanhe tudo em poucos minutos.</p><button className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-semibold text-[#1d1d1f]" onClick={() => openAuth("signup")}>Criar minha empresa <ArrowRight className="size-4" /></button></div></section>
    </main>

    <footer className="border-t border-black/10 px-6 py-10"><div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-[#6e6e73] sm:flex-row sm:items-center sm:justify-between"><Brand /><p>© 2026 Simbi. Tempo bem cuidado.</p><button className="font-medium text-[#1d1d1f]" onClick={() => openAuth("signin")}>Acessar plataforma</button></div></footer>

    {showAuth && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuth(false); }}><section className="relative w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl sm:p-9"><button className="absolute right-5 top-5 grid size-9 place-items-center rounded-full bg-[#f5f5f7]" onClick={() => setShowAuth(false)} aria-label="Fechar"><X className="size-4" /></button><Brand /><h2 className="mt-10 text-3xl font-semibold tracking-tight">{mode === "signin" ? "Acesse a Simbi" : "Crie sua empresa"}</h2><p className="mt-2 text-sm text-[#6e6e73]">{mode === "signin" ? "Entre para acessar seu painel ou registrar o ponto." : "Sua operação organizada começa aqui."}</p><form className="mt-7 space-y-4" onSubmit={submit}>{mode === "signup" && <MarketingField label="Seu nome" name="fullName" placeholder="Nome completo" />}<MarketingField label="E-mail" name="email" type="email" placeholder="voce@empresa.com" /><MarketingField label="Senha" name="password" type="password" placeholder="Mínimo de 8 caracteres" minLength={8} /><button className="h-12 w-full rounded-xl bg-[#0071e3] font-semibold text-white hover:bg-[#0077ed]" disabled={busy}>{busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}</button></form><div className="my-5 flex items-center gap-3 text-xs text-[#86868b]"><span className="h-px flex-1 bg-black/10" />ou<span className="h-px flex-1 bg-black/10" /></div><button className="h-12 w-full rounded-xl border border-black/15 font-semibold" onClick={googleSignIn} disabled={busy}>Continuar com Google</button>{notice && <p className="mt-4 text-center text-sm text-[#0066cc]" role="status">{notice}</p>}<button className="mt-5 w-full text-sm font-medium text-[#0066cc]" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }}>{mode === "signin" ? "Ainda não tem conta? Criar empresa" : "Já tem conta? Entrar"}</button></section></div>}
  </div>;
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
  const createEmployeeFn = useServerFn(createEmployee); const listEmployeesFn = useServerFn(listEmployees); const updateEmployeeFn = useServerFn(updateEmployee); const deleteEmployeeFn = useServerFn(deleteEmployee);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [team, setTeam] = useState<Member[]>(members); const [editing, setEditing] = useState<Member | null>(null);
  const refresh = useCallback(async () => { const result = await listEmployeesFn(); setTeam(result as Member[]); }, [listEmployeesFn]);
  useEffect(() => { refresh().catch(() => setMessage("Não foi possível carregar os e-mails da equipe.")); }, [refresh]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); try { await createEmployeeFn({ data: { fullName: String(form.get("fullName")), jobTitle: String(form.get("jobTitle")), email: String(form.get("email")), password: String(form.get("password")), workStart: String(form.get("workStart")), workEnd: String(form.get("workEnd")), breakMinutes: Number(form.get("breakMinutes")) } }); setMessage("Funcionário cadastrado com sucesso. Ele já pode entrar com o e-mail e a senha inicial."); event.currentTarget.reset(); await refresh(); onCreated(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o funcionário."); } setBusy(false); }
  async function saveEdit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editing) return; setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); try { await updateEmployeeFn({ data: { userId: editing.user_id, fullName: String(form.get("fullName")), jobTitle: String(form.get("jobTitle")), email: String(form.get("email")), password: String(form.get("password")), workStart: String(form.get("workStart")), workEnd: String(form.get("workEnd")), breakMinutes: Number(form.get("breakMinutes")) } }); setMessage("Dados do funcionário atualizados."); setEditing(null); await refresh(); onCreated(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o funcionário."); } setBusy(false); }
  async function remove(member: Member) { if (!window.confirm(`Apagar ${member.full_name}? O acesso e todos os registros de ponto dessa pessoa serão excluídos.`)) return; setBusy(true); setMessage(""); try { await deleteEmployeeFn({ data: { userId: member.user_id } }); setMessage("Funcionário apagado com sucesso."); if (editing?.user_id === member.user_id) setEditing(null); await refresh(); onCreated(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível apagar o funcionário."); } setBusy(false); }
  const scheduleFields = (member?: Member) => <div className="rounded-2xl border border-black/[.07] bg-[#f5f5f7] p-4"><p className="text-xs font-semibold text-[#0066cc]">JORNADA INDIVIDUAL</p><p className="mt-1 text-xs text-muted-foreground">Deixe os horários em branco para usar o padrão da empresa.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-muted-foreground">Entrada<Input className="mt-1.5 h-10 border-black/10 bg-white" name="workStart" type="time" defaultValue={member?.work_start?.slice(0, 5) ?? ""} /></label><label className="text-xs font-semibold text-muted-foreground">Saída<Input className="mt-1.5 h-10 border-black/10 bg-white" name="workEnd" type="time" defaultValue={member?.work_end?.slice(0, 5) ?? ""} /></label></div><label className="mt-3 block text-xs font-semibold text-muted-foreground">Intervalo (minutos)<Input className="mt-1.5 h-10 border-black/10 bg-white" name="breakMinutes" type="number" min="0" max="480" defaultValue={member?.break_minutes ?? 60} /></label></div>;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-md"><section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><Label>Equipe</Label><h2 className="mt-2 font-display text-3xl font-black tracking-tight">Pessoas, acessos e jornadas</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X /></Button></div><div className="mt-6 grid gap-8 md:grid-cols-2"><div><h3 className="font-bold">Cadastrados</h3><div className="mt-3 space-y-2">{team.length === 0 && <p className="rounded-xl bg-[#f5f5f7] p-4 text-sm text-muted-foreground">Nenhum funcionário cadastrado.</p>}{team.map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] p-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eaf3ff] text-xs font-black text-[#0066cc]">{initials(member.full_name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.full_name || "Sem nome"}</p><p className="truncate text-xs text-muted-foreground">{member.job_title || "Funcionário"} · {member.work_start?.slice(0, 5) ?? "Padrão"}{member.work_end ? `–${member.work_end.slice(0, 5)}` : ""}</p></div><Button variant="ghost" size="icon" aria-label={`Editar ${member.full_name}`} onClick={() => { setEditing(member); setMessage(""); }}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`Apagar ${member.full_name}`} disabled={busy} onClick={() => remove(member)}><Trash2 className="size-4 text-warning" /></Button></div>)}</div></div>{editing ? <form key={editing.user_id} onSubmit={saveEdit} className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">Editar funcionário</h3><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button></div><Field label="Nome" name="fullName" defaultValue={editing.full_name} /><Field label="Cargo" name="jobTitle" defaultValue={editing.job_title} /><Field label="E-mail de acesso" name="email" type="email" defaultValue={editing.email} />{scheduleFields(editing)}<label className="block text-xs font-semibold text-muted-foreground">Nova senha (opcional)<Input className="mt-1.5 h-11 border-black/10 bg-white" name="password" type="password" minLength={8} placeholder="Deixe em branco para manter" /></label><Button variant="kinetic" className="w-full" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button></form> : <form onSubmit={submit} className="space-y-3"><h3 className="font-bold">Novo funcionário</h3><Field label="Nome" name="fullName" /><Field label="Cargo" name="jobTitle" /><Field label="E-mail de acesso" name="email" type="email" />{scheduleFields()}<Field label="Senha inicial" name="password" type="password" minLength={8} /><Button variant="kinetic" className="w-full" disabled={busy}><Plus />{busy ? "Cadastrando..." : "Cadastrar funcionário"}</Button></form>}</div>{message && <p className="mt-5 text-sm text-[#0066cc]" role="status">{message}</p>}</section></div>;
}

function Metric({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null); const [value, setValue] = useState(0);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) return; observer.disconnect(); if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; } const started = performance.now(); const tick = (now: number) => { const progress = Math.min((now - started) / 1200, 1); setValue(Math.round(target * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, { threshold: .5 }); observer.observe(node); return () => observer.disconnect(); }, [target]);
  return <div ref={ref}><p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums sm:text-4xl">{value}{suffix}</p><p className="mt-2 text-sm text-[#6e6e73]">{label}</p></div>;
}
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) { const ref = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(false); useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold: .08 }); observer.observe(node); return () => observer.disconnect(); }, []); return <div ref={ref} className={`reveal ${visible ? "is-visible" : ""}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>; }
function ProductPhone() { return <div className="relative mx-auto mt-12 flex min-h-[620px] max-w-[620px] items-end justify-center overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_50%_10%,#dff1ff_0,#f4f7fb_42%,#e8edf3_100%)] px-5 pt-10 sm:min-h-[700px]"><div className="phone-float relative w-[330px] rounded-[52px] border-[7px] border-[#17171a] bg-[#f7f7f9] p-3 pb-0 shadow-[0_35px_70px_rgba(0,0,0,.28)] sm:w-[370px]"><div className="relative min-h-[640px] overflow-hidden rounded-[40px] bg-white px-6 pb-8 pt-16 sm:min-h-[680px]"><div className="absolute left-1/2 top-3 h-7 w-28 -translate-x-1/2 rounded-full bg-[#17171a]" /><div className="flex items-center justify-between"><Brand compact /><div className="grid size-9 place-items-center rounded-full bg-[#eaf3ff] text-xs font-semibold text-[#0066cc]">MA</div></div><p className="mt-10 text-sm text-[#6e6e73]">Bom dia, Marina</p><h4 className="mt-1 text-3xl font-semibold tracking-tight">Sua jornada</h4><div className="mt-8 rounded-[26px] bg-[#f5f5f7] p-6 text-center"><p className="text-sm text-[#6e6e73]">Tempo trabalhado hoje</p><p className="mt-3 text-5xl font-semibold tracking-[-0.05em] tabular-nums">06:42</p><div className="mx-auto mt-5 h-1.5 max-w-52 overflow-hidden rounded-full bg-black/10"><div className="h-full w-[78%] rounded-full bg-[#0071e3]" /></div><p className="mt-3 text-xs text-[#86868b]">Meta diária · 8h</p></div><button className="mt-6 h-14 w-full rounded-2xl bg-[#0071e3] font-semibold text-white">Registrar saída</button><div className="mt-7"><div className="flex items-center justify-between"><p className="font-semibold">Registros de hoje</p><span className="text-xs text-[#0066cc]">Ver histórico</span></div>{[["Entrada", "08:02"], ["Intervalo", "12:06"], ["Retorno", "13:04"]].map(([label, time]) => <div key={label} className="mt-4 flex items-center justify-between border-b border-black/[.06] pb-3 text-sm"><span className="text-[#6e6e73]">{label}</span><span className="font-semibold tabular-nums">{time}</span></div>)}</div></div></div></div>; }
function ManagementPreview() { const bars = [42, 58, 51, 74, 67, 88, 79, 93, 82, 96, 72, 86]; return <div className="mt-10 overflow-hidden rounded-[24px] border border-white/10 bg-[#f6f7f9] text-[#1d1d1f] shadow-2xl"><div className="flex items-center justify-between border-b border-black/[.06] px-5 py-4 sm:px-7"><div><p className="text-xs text-[#6e6e73]">Visão geral</p><p className="mt-0.5 font-semibold">Aurora Serviços</p></div><div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium shadow-sm"><CalendarDays className="size-3.5 text-[#0066cc]" />Esta semana</div></div><div className="p-5 sm:p-7"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["24", "Funcionários", "+2 este mês"], ["17", "Em expediente", "Agora"], ["842h", "Horas no mês", "+8,4%"], ["03", "Atenções", "Revisar"]].map(([value, label, detail]) => <div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs font-medium text-[#6e6e73]">{label}</p><p className="mt-3 text-[10px] text-[#0066cc]">{detail}</p></div>)}</div><div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_.8fr]"><div className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="font-semibold">Horas registradas</p><p className="mt-1 text-xs text-[#86868b]">Últimos 12 dias</p></div><p className="text-sm font-semibold text-[#15704a]">+12,6%</p></div><div className="mt-8 flex h-36 items-end gap-2">{bars.map((height, index) => <div key={index} className="flex-1 rounded-t-sm bg-[#0071e3]" style={{ height: `${height}%`, opacity: .35 + index / 18 }} />)}</div><div className="mt-3 flex justify-between text-[9px] text-[#86868b]"><span>01 set</span><span>06 set</span><span>12 set</span></div></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="font-semibold">Equipe agora</p><p className="mt-1 text-xs text-[#86868b]">17 de 24 ativos</p><div className="mt-5 space-y-4">{[["MC", "Marina Costa", "Em expediente"], ["RL", "Rafael Lima", "Em intervalo"], ["AS", "Ana Souza", "Em expediente"]].map(([avatar, name, status], index) => <div key={name} className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eaf3ff] text-[10px] font-semibold text-[#0066cc]">{avatar}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{name}</p><p className="mt-0.5 text-[10px] text-[#86868b]">{status}</p></div><span className={`size-2 rounded-full ${index === 1 ? "bg-[#ff9f0a]" : "bg-[#34c759]"}`} /></div>)}</div><button className="mt-5 w-full rounded-xl bg-[#f5f5f7] py-2.5 text-xs font-semibold text-[#0066cc]">Ver toda a equipe</button></div></div></div></div>; }
function FeatureCard({ icon, eyebrow, title, text, visual, className = "", dark = false }: { icon: React.ReactNode; eyebrow: string; title: string; text: string; visual: React.ReactNode; className?: string; dark?: boolean }) { return <article className={`overflow-hidden rounded-[30px] p-7 sm:p-10 ${className}`}><div className={dark ? "text-[#2997ff]" : "text-[#0071e3]"}>{icon}</div><p className={`mt-6 text-sm font-semibold ${dark ? "text-white/55" : "text-[#6e6e73]"}`}>{eyebrow}</p><h3 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{title}</h3><p className={`mt-4 max-w-xl leading-relaxed ${dark ? "text-white/60" : "text-[#6e6e73]"}`}>{text}</p>{visual}</article>; }
function MarketingField({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) { return <label className="block text-xs font-semibold text-[#6e6e73]">{label}<Input className="mt-1.5 h-12 rounded-xl border-black/15 bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:ring-[#0071e3]" required {...props} /></label>; }
function LoadingScreen() { return <div className="relative min-h-screen overflow-hidden bg-[#11141a] text-white"><div className="absolute inset-0 scale-105 opacity-70 blur-[10px]"><div className="mx-auto max-w-6xl px-6 py-7"><header className="flex items-center justify-between"><Brand /><div className="h-10 w-28 rounded-full bg-white/10" /></header><div className="mt-16"><div className="h-4 w-32 rounded-full bg-white/10" /><div className="mt-5 h-14 w-[min(440px,80%)] rounded-2xl bg-white/10" /><div className="mt-10 grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 rounded-3xl border border-white/10 bg-white/[.07] p-6"><div className="h-3 w-20 rounded-full bg-white/10" /><div className="mt-6 h-8 w-24 rounded-xl bg-white/10" /></div>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_.8fr]"><div className="h-72 rounded-3xl border border-white/10 bg-white/[.07]" /><div className="h-72 rounded-3xl border border-white/10 bg-white/[.07]" /></div></div></div></div><div className="absolute inset-0 grid place-items-center bg-[#11141a]/45 backdrop-blur-xl"><div className="flex flex-col items-center"><div className="grid size-20 place-items-center rounded-[28px] border border-white/15 bg-white/10 shadow-2xl"><span className="font-display text-5xl font-semibold tracking-[-0.1em]">S</span></div><p className="mt-6 text-lg font-semibold tracking-[-0.03em]">Preparando sua Simbi</p><div className="mt-5 h-1.5 w-36 overflow-hidden rounded-full bg-white/15"><div className="loading-bar h-full rounded-full bg-[#2997ff]" /></div><p className="mt-4 text-sm text-white/55">Organizando seus dados com segurança.</p></div></div></div>; }
function AppBackdrop({ children }: { children: React.ReactNode }) { return <div className="relative min-h-screen overflow-hidden bg-background text-foreground">{children}</div>; }
function Brand({ compact = false }: { compact?: boolean }) { return <div className="flex items-center gap-2.5" aria-label="Simbi"><span className={`${compact ? "text-[27px]" : "text-[34px]"} inline-block font-semibold leading-none tracking-[-0.09em]`} aria-hidden="true">S</span><span className={`${compact ? "text-lg" : "text-xl"} font-semibold tracking-[-0.045em]`}>simbi</span></div>; }
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
function scheduleMinutes(workStart: string | null | undefined, workEnd: string | null | undefined, breakMinutes: number | null | undefined, company: Company) { const start = workStart ?? company.work_start; const end = workEnd ?? company.work_end; const [startHour, startMinute] = start.slice(0, 5).split(":").map(Number); const [endHour, endMinute] = end.slice(0, 5).split(":").map(Number); const difference = (endHour * 60 + endMinute) - (startHour * 60 + startMinute) - (breakMinutes ?? company.break_minutes); return difference > 0 ? difference : company.workday_minutes; }
function calculateWorkedMinutes(entries: Entry[], now: Date) { let total = 0; let start: Date | null = null; for (const entry of entries) { if (entry.event_type === "clock_in") start = new Date(entry.recorded_at); else if (start) { total += new Date(entry.recorded_at).getTime() - start.getTime(); start = null; } } if (start) total += now.getTime() - start.getTime(); return total / 60000; }
function calculateExtraMinutes(entries: Entry[], target: number) { const grouped = new Map<string, Entry[]>(); for (const entry of [...entries].reverse()) { const key = new Date(entry.recorded_at).toDateString(); grouped.set(key, [...(grouped.get(key) ?? []), entry]); } let balance = 0; for (const dayEntries of grouped.values()) balance += calculateWorkedMinutes(dayEntries, new Date()) - target; return Math.round(balance); }
