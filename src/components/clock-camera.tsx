import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Capture stays in memory. This component does not upload or persist photographs.
export function ClockCamera({
  photo,
  onPhoto,
  disabled,
}: {
  photo: string | null;
  onPhoto: (photo: string | null) => void;
  disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [opening, setOpening] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setLive(false);
        setOpening(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function open() {
    if (opening || disabled) return;
    stop();
    onPhoto(null);
    setError("");
    setOpening(true);
    setLive(false);
    const request = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      if (request !== generation.current || !video.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
      if (request === generation.current) setLive(true);
    } catch (reason) {
      if (request !== generation.current) return;
      stop();
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Permita o uso da câmera nas configurações do navegador e tente novamente."
          : "Não foi possível abrir a câmera. Confira se ela está conectada e livre, ou avise o responsável.",
      );
    } finally {
      if (request === generation.current || !stream.current) setOpening(false);
    }
  }
  function capture() {
    if (!video.current?.videoWidth || !live || disabled) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(video.current.videoWidth, video.current.videoHeight));
    canvas.width = Math.round(video.current.videoWidth * scale);
    canvas.height = Math.round(video.current.videoHeight * scale);
    if (canvas.width < 160 || canvas.height < 120) {
      setError(
        "A câmera precisa de uma resolução maior. Use outro aparelho ou avise o responsável.",
      );
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Não foi possível capturar. Tente novamente.");
      return;
    }
    context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.78);
    if (result.length > 800_023) {
      setError("A foto ficou muito grande. Tente novamente com melhor iluminação.");
      return;
    }
    onPhoto(result);
    stop();
    setLive(false);
  }
  return (
    <section className="mt-6 text-left" aria-label="Foto do registro">
      <div className="relative overflow-hidden rounded-3xl bg-[#0b1122] aspect-[4/3]">
        {photo ? (
          <img
            src={photo}
            alt="Foto capturada para este registro"
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-contain -scale-x-100 ${live ? "" : "invisible"}`}
              aria-label="Prévia da câmera"
            />
            {!live && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
                <Camera className="size-9" />
                <p className="text-sm">
                  {opening ? "Abrindo câmera..." : "Uma foto para confirmar seu registro"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        A foto ficará vinculada ao ponto para conferência do responsável. Enquadre seu rosto com boa
        iluminação.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {photo ? (
        <Button variant="outline" className="mt-3 w-full" onClick={open} disabled={disabled}>
          <RotateCcw className="size-4" />
          Refazer foto
        </Button>
      ) : (
        <Button
          className="mt-3 h-12 w-full"
          onClick={live ? capture : open}
          disabled={opening || disabled}
        >
          <Camera className="size-4" />
          {live ? "Tirar foto" : "Abrir câmera"}
        </Button>
      )}
    </section>
  );
}
