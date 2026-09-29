import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock3, LogOut } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/p/$companyId")({
  head: () => ({ meta: [
    { title: "Ponto da empresa | Simbi" },
    { name: "description", content: "Entre com seu acesso para registrar seu ponto na Simbi." },
    { property: "og:title", content: "Ponto da empresa | Simbi" },
    { property: "og:description", content: "Acesso individual para registrar o ponto da sua empresa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CompanyPoint,
});

type Employee = { id: string; name: string; companyName: string };
type Receipt = { name: string; companyName: string; kind: "Entrada" | "Saída"; time: string };

function CompanyPoint() {
  const { companyId } = Route.useParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  // A shared terminal must never retain the previous worker's session.
  useEffect(() => {
    let active = true;
    supabase.auth.signOut({ scope: "local" }).then(({ error: signOutError }) => {
      if (!active) return;
      if (signOutError) setError("Não foi possível preparar o aparelho. Atualize a página.");
      setPreparing(false);
    }).catch(() => { if (active) { setError("Não foi possível preparar o aparelho. Atualize a página."); setPreparing(false); } });
    return () => { active = false; };
  }, []);

  async function signOut() {
    setEmployee(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) setError("Não foi possível encerrar a sessão. Atualize a página antes do próximo funcionário.");
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preparing || employee) return;
    setBusy(true); setError(""); setReceipt(null);
    const form = new FormData(event.currentTarget);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("email")).trim(), password: String(form.get("password")) });
      if (authError || !data.user) { setError("E-mail ou senha incorretos. Confira os dados e tente novamente."); return; }
      const { data: profile, error: profileError } = await supabase.from("profiles").select("full_name, company_id").eq("user_id", data.user.id).maybeSingle();
      const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "employee").maybeSingle();
      if (profileError || roleError || !profile || profile.company_id !== companyId || !role) {
        await signOut();
        setError("Este acesso não pertence aos funcionários desta empresa. Confira o link com o responsável.");
        return;
      }
      const { data: company, error: companyError } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
      if (companyError || !company) {
        await signOut(); setError("Não foi possível confirmar a empresa. Tente novamente."); return;
      }
      setEmployee({ id: data.user.id, name: profile.full_name, companyName: company.name });
    } catch {
      await signOut(); setError("Não foi possível conectar agora. Tente novamente.");
    } finally { setBusy(false); }
  }

  async function register() {
    if (!employee || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { data: currentUser, error: userError } = await supabase.auth.getUser();
      if (userError || currentUser.user?.id !== employee.id) { await signOut(); setError("Sua sessão terminou. Entre novamente."); return; }
      const { data: last, error: lastError } = await supabase.from("time_entries").select("event_type, recorded_at").eq("company_id", companyId).eq("user_id", employee.id).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      if (lastError) throw lastError;
      if (last && Date.now() - new Date(last.recorded_at).getTime() < 60_000) {
        setError("Aguarde um minuto antes de registrar outro ponto."); return;
      }
      const eventType = last?.event_type === "clock_in" ? "clock_out" : "clock_in";
      const { data: entry, error: entryError } = await supabase.from("time_entries").insert({ company_id: companyId, user_id: employee.id, event_type: eventType }).select("recorded_at").single();
      if (entryError || !entry) throw entryError ?? new Error("Falha ao registrar o ponto");
      const completed: Receipt = { name: employee.name, companyName: employee.companyName, kind: eventType === "clock_in" ? "Entrada" : "Saída", time: new Date(entry.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
      await signOut();
      setReceipt(completed);
    } catch { setError("Não foi possível registrar o ponto. Tente novamente ou avise o responsável."); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <div className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-border px-5 py-5">
      <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold" aria-label="Simbi — início">simbi</Link>
      <span className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Ponto da empresa</span>
    </header>
    <main className="mx-auto flex min-h-[calc(100vh-82px)] max-w-md flex-col justify-center px-5 py-10">
      {receipt ? <div className="text-center" role="status">
        <CheckCircle2 className="mx-auto size-14 text-positive" />
        <p className="mt-6 text-sm font-semibold text-primary">{receipt.companyName}</p>
        <h1 className="mt-3 font-display text-3xl font-bold">{receipt.kind} registrada.</h1>
        <p className="mt-4 text-muted-foreground">{receipt.name} · {receipt.time}</p>
        <Button className="mt-10 w-full" size="lg" onClick={() => { setReceipt(null); setError(""); }}>Próximo funcionário</Button>
      </div> : employee ? <div>
        <p className="text-sm font-semibold text-primary">{employee.companyName}</p>
        <h1 className="mt-3 font-display text-3xl font-bold">Olá, {employee.name}.</h1>
        <p className="mt-3 text-muted-foreground">Confirme seu registro de ponto.</p>
        <Button variant="kinetic" size="punch" className="mt-9 w-full" onClick={register} disabled={busy}> {busy ? "Registrando..." : "Registrar ponto"}</Button>
        <Button variant="ghost" className="mt-3 w-full" onClick={signOut} disabled={busy}><LogOut className="size-4" /> Sair sem registrar</Button>
      </div> : <div>
        <p className="text-sm font-semibold text-primary">ACESSO DA EQUIPE</p>
        <h1 className="mt-3 font-display text-3xl font-bold">Registrar ponto</h1>
        <p className="mt-3 text-muted-foreground">Entre com o e-mail e a senha fornecidos pela empresa.</p>
        <form className="mt-9 space-y-5" onSubmit={signIn}>
          <label className="block text-sm font-semibold">E-mail<Input className="mt-2 h-12" name="email" type="email" autoComplete="off" required disabled={preparing || busy} /></label>
          <label className="block text-sm font-semibold">Senha<Input className="mt-2 h-12" name="password" type="password" autoComplete="off" required disabled={preparing || busy} /></label>
          <Button className="h-12 w-full" type="submit" disabled={preparing || busy || Boolean(error && preparing)}>{preparing ? "Preparando..." : busy ? "Entrando..." : "Entrar"}</Button>
        </form>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar à Simbi</Link>
      </div>}
      {error && <p className="mt-6 text-center text-sm text-destructive" role="alert">{error}</p>}
    </main>
  </div>;
}