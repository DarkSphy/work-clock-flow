import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Delete, LogIn, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { identifyClockPin, confirmClockPin } from "@/lib/clock.functions";

export const Route = createFileRoute("/p/$companyId")({
  head: () => ({
    meta: [{ title: "Registrar ponto | Simbi" }, { name: "robots", content: "noindex" }],
  }),
  component: CompanyPoint,
});

type Person = { name: string; eventType: "clock_in" | "clock_out"; ticket: string };
function CompanyPoint() {
  const { companyId } = Route.useParams();
  const identify = useServerFn(identifyClockPin);
  const confirm = useServerFn(confirmClockPin);
  const [pin, setPin] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [receipt, setReceipt] = useState<{
    name: string;
    eventType: string;
    recordedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    setReady(true);
  }, []);
  function reset() {
    setPin("");
    setPerson(null);
    setReceipt(null);
    setError("");
  }
  useEffect(() => {
    if (!person && !receipt) return;
    const timeout = window.setTimeout(reset, receipt ? 6000 : 45000);
    return () => window.clearTimeout(timeout);
  }, [person, receipt]);
  async function digit(value: string) {
    if (!ready || inFlight.current || person || receipt) return;
    const next = value === "delete" ? pin.slice(0, -1) : (pin + value).slice(0, 4);
    setPin(next);
    setError("");
    if (next.length !== 4) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await identify({ data: { companyId, pin: next } });
      setPin("");
      if ("error" in result) setError(result.error);
      else setPerson(result);
    } catch {
      setPin("");
      setError("Não foi possível consultar seu PIN. Tente novamente ou avise o responsável.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        void digit(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        void digit("delete");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function register() {
    if (!person || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await confirm({ data: { companyId, ticket: person.ticket } });
      if ("error" in result) {
        setPerson(null);
        setError(result.error);
      } else {
        setReceipt({ ...result, name: person.name });
        setPerson(null);
      }
    } catch {
      setPerson(null);
      setError(
        "Não foi possível confirmar. Confira seus registros com o responsável antes de repetir.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f5f5f7] px-6 py-8 text-[#1d1d1f]">
      <section className="w-full max-w-sm text-center" aria-busy={busy}>
        <div className="mb-8">
          <Brand compact />
        </div>
        {receipt ? (
          <div role="status">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="size-10" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold">
              {receipt.eventType === "clock_in" ? "Entrada registrada" : "Saída registrada"}
            </h1>
            <p className="mt-4 text-xl">{receipt.name}</p>
            <p className="mt-2 text-muted-foreground">
              {new Date(receipt.recordedAt).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <Button onClick={reset} className="mt-8 h-14 w-full rounded-2xl">
              Próximo funcionário
            </Button>
          </div>
        ) : person ? (
          <div>
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-blue-100 text-blue-700">
              {person.eventType === "clock_in" ? (
                <LogIn className="size-9" />
              ) : (
                <LogOut className="size-9" />
              )}
            </div>
            <p className="mt-6 text-lg text-muted-foreground">Olá,</p>
            <h1 className="mt-2 break-words text-3xl font-semibold">{person.name}</h1>
            <p className="mt-5 text-xl">
              Você está {person.eventType === "clock_in" ? "entrando" : "saindo"}.
            </p>
            <Button
              className="mt-8 h-16 w-full rounded-2xl text-lg"
              disabled={!ready || busy}
              onClick={register}
            >
              {busy
                ? "Registrando..."
                : person.eventType === "clock_in"
                  ? "Confirmar entrada"
                  : "Confirmar saída"}
            </Button>
            <Button variant="ghost" className="mt-3 h-12 w-full" disabled={busy} onClick={reset}>
              Não sou eu / Cancelar
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-4xl font-semibold tracking-tight">Registrar ponto</h1>
            <div
              className="my-10 flex justify-center gap-4"
              role="status"
              aria-label={`${pin.length} de 4 dígitos digitados`}
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-4 rounded-full ${i < pin.length ? "bg-[#0071e3]" : "bg-black/15"}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"].map(
                (value, index) =>
                  value ? (
                    <button
                      key={value}
                      type="button"
                      aria-label={value === "delete" ? "Apagar último dígito" : value}
                      disabled={!ready || busy}
                      onClick={() => void digit(value)}
                      className="flex h-20 touch-manipulation items-center justify-center rounded-2xl bg-white text-3xl font-medium shadow-sm transition hover:bg-blue-50 active:scale-95 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
                    >
                      {value === "delete" ? <Delete className="size-7" /> : value}
                    </button>
                  ) : (
                    <span key={index} />
                  ),
              )}
            </div>
            {busy && (
              <p className="mt-6 text-sm" role="status">
                Consultando...
              </p>
            )}
          </>
        )}
        {error && (
          <p className="mt-6 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
