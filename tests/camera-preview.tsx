import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ClockCamera } from "../src/components/clock-camera";
import { Brand } from "../src/components/brand";
import "../src/styles.css";
export function Preview() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <Brand />
      <h1 className="mt-6 text-2xl">Funcionário de exemplo</h1>
      <p>Você está entrando.</p>
      {visible && <ClockCamera photo={photo} onPhoto={setPhoto} disabled={false} />}
      <button
        disabled={!photo}
        className="mt-5 rounded-xl bg-blue-600 p-4 text-white disabled:opacity-40"
      >
        Confirmar entrada
      </button>
      <button
        className="mt-4 block w-full"
        onClick={() => {
          setVisible(false);
          setPhoto(null);
        }}
      >
        Cancelar
      </button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
