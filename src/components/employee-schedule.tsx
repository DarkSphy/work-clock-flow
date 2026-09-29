import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  dayNames,
  defaultSchedule,
  duration,
  hours,
  localDate,
  readSchedule,
  type WorkSchedule,
} from "@/lib/work-schedule";

export function EmployeeSchedule({
  value,
  startDate,
  fallback,
}: {
  value?: unknown;
  startDate?: string;
  fallback?: WorkSchedule;
}) {
  const [schedule, setSchedule] = useState(() =>
    readSchedule(value, fallback ?? defaultSchedule()),
  );
  function update(index: number, patch: Partial<WorkSchedule[number]>) {
    setSchedule((old) => old.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }
  const total = schedule.reduce(
    (sum, day) =>
      sum + (day.enabled ? Math.max(0, duration(day.start, day.end) - day.breakMinutes) : 0),
    0,
  );
  return (
    <section className="rounded-2xl border border-black/10 bg-[#f5f5f7] p-4">
      <h4 className="text-sm font-bold">Dias e horários de trabalho</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Ajuste a segunda e copie para os dias úteis. Sábado e domingo podem ter outros horários ou
        ser folga.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        A escala atual é usada nas estimativas de todos os meses. Registre também as saídas e os
        retornos dos intervalos.
      </p>
      <input type="hidden" name="workSchedule" value={JSON.stringify(schedule)} />
      <input type="hidden" name="workStart" value={schedule[1]!.start} />
      <input type="hidden" name="workEnd" value={schedule[1]!.end} />
      <input type="hidden" name="breakMinutes" value={schedule[1]!.breakMinutes} />
      <label className="mt-4 block text-xs font-semibold">
        Início da contagem de horas
        <Input
          className="mt-1 bg-white"
          type="date"
          name="startDate"
          required
          defaultValue={startDate ?? localDate()}
        />
        <span className="mt-1 block font-normal text-muted-foreground">
          Use a admissão ou o primeiro dia acompanhado pela Simbi.
        </span>
      </label>
      <Button
        type="button"
        variant="outline"
        className="my-4 h-auto w-full whitespace-normal py-2 text-xs"
        onClick={() =>
          setSchedule((old) => old.map((day, i) => (i >= 2 && i <= 5 ? { ...old[1]! } : day)))
        }
      >
        Copiar segunda para terça a sexta
      </Button>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => {
          const day = schedule[i]!;
          return (
            <div key={i} className="rounded-xl bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => update(i, { enabled: e.target.checked })}
                />
                {dayNames[i]}
                {!day.enabled && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">Folga</span>
                )}
              </label>
              {day.enabled && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <label className="text-xs">
                    Entrada
                    <Input
                      type="time"
                      value={day.start}
                      required
                      onChange={(e) => update(i, { start: e.target.value })}
                    />
                  </label>
                  <label className="text-xs">
                    Saída
                    <Input
                      type="time"
                      value={day.end}
                      required
                      onChange={(e) => update(i, { end: e.target.value })}
                    />
                  </label>
                  <label className="text-xs">
                    Pausa (min)
                    <Input
                      type="number"
                      min={0}
                      max={480}
                      value={day.breakMinutes}
                      required
                      onChange={(e) => update(i, { breakMinutes: Number(e.target.value) })}
                    />
                  </label>
                  <p className="col-span-3 text-xs text-muted-foreground">
                    {hours(Math.max(0, duration(day.start, day.end) - day.breakMinutes))} de
                    trabalho{day.end < day.start ? " · saída no dia seguinte" : ""}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-semibold">Total semanal: {hours(total)}</p>
    </section>
  );
}
