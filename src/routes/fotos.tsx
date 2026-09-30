import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, RefreshCw } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { listClockPhotos, viewClockPhoto } from "@/lib/clock-photos.functions";
import { localDate } from "@/lib/work-schedule";
import { timeLabel } from "@/lib/reports";

export const Route = createFileRoute("/fotos")({
  head: () => ({
    meta: [{ title: "Fotos dos registros | Simbi" }, { name: "robots", content: "noindex" }],
  }),
  component: Photos,
});
type PhotoList = Awaited<ReturnType<typeof listClockPhotos>>;
function Photos() {
  const list = useServerFn(listClockPhotos);
  const view = useServerFn(viewClockPhoto);
  const [date, setDate] = useState(localDate);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<PhotoList | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PhotoList["entries"][number] | null>(null);
  const [url, setUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    list({ data: { date, page } })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar as fotos. Entre como responsável e confira se a atualização do banco foi aplicada.",
          );
      });
    return () => {
      active = false;
    };
  }, [date, page, revision, list]);
  useEffect(() => {
    let active = true;
    setUrl("");
    setPhotoError("");
    if (!selected) return;
    view({ data: { entryId: selected.entry_id } })
      .then((result) => {
        if (active) setUrl(result.url);
      })
      .catch(() => {
        if (active) setPhotoError("Não foi possível abrir a foto. Feche e tente novamente.");
      });
    // Drop the signed URL and photo from the UI when its short viewing window ends.
    const timer = window.setTimeout(() => {
      setUrl("");
      setPhotoError("A visualização expirou. Feche e abra a foto novamente.");
    }, 120000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selected, view]);
  return (
    <main className="min-h-svh bg-[#f5f5f7] px-5 py-6 text-[#1d1d1f] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3 border-b border-black/10 pb-5">
          <Link to="/">
            <Brand compact />
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Painel
            </Link>
          </Button>
        </header>
        <section className="py-10">
          <p className="text-xs font-bold tracking-widest text-blue-600">CONFERÊNCIA DA EMPRESA</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Fotos dos registros</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Confira a foto vinculada a cada entrada ou saída. Acesso restrito ao responsável da
            empresa. Registros anteriores à ativação da foto não aparecem aqui.
          </p>
          <div className="my-7 flex flex-wrap items-end gap-4 rounded-3xl bg-white p-5">
            <label className="text-sm font-medium">
              Dia dos registros
              <Input
                type="date"
                className="mt-2"
                value={date}
                max={localDate()}
                onChange={(event) => {
                  if (/^20\d{2}-\d{2}-\d{2}$/.test(event.target.value)) {
                    setDate(event.target.value);
                    setPage(0);
                  }
                }}
              />
            </label>
            <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-700">
              {error}
            </p>
          ) : !data ? (
            <p role="status" className="py-10 text-center">
              Carregando registros...
            </p>
          ) : (
            <>
              <div className="overflow-hidden rounded-3xl bg-white">
                {!data.entries.length && (
                  <p className="p-10 text-center text-muted-foreground">Nenhuma foto neste dia.</p>
                )}
                {data.entries.map((entry) => (
                  <article
                    key={entry.entry_id}
                    className="flex flex-wrap items-center justify-between gap-4 border-b border-black/5 p-5 last:border-0"
                  >
                    <div>
                      <p className="font-semibold">{entry.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.event_type === "clock_in" ? "Entrada" : "Saída"} ·{" "}
                        {timeLabel(entry.recorded_at)} · horário de São Paulo
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setSelected(entry)}>
                      <Camera className="size-4" />
                      Ver foto
                    </Button>
                  </article>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">Página {page + 1}</span>
                <Button
                  variant="ghost"
                  disabled={!data.hasMore}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setUrl("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>{selected?.name}</DialogTitle>
          <DialogDescription>
            {selected?.event_type === "clock_in" ? "Entrada" : "Saída"} ·{" "}
            {selected &&
              new Date(selected.recorded_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
          </DialogDescription>
          {photoError ? (
            <p role="alert" className="text-sm text-red-700">
              {photoError}
            </p>
          ) : url ? (
            <img
              src={url}
              alt={`Foto do registro de ${selected?.name}`}
              referrerPolicy="no-referrer"
              className="max-h-[60svh] w-full rounded-2xl bg-slate-950 object-contain"
              onError={() => setPhotoError("Foto indisponível. Feche e tente novamente.")}
            />
          ) : (
            <p role="status" className="py-12 text-center">
              Abrindo foto...
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
