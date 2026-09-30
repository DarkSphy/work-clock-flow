import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadCompanyReport } from "@/lib/reports.functions";
import type { ReportData } from "@/lib/reports";
export function useCompanyReport(month: string, revision = 0) {
  const load = useServerFn(loadCompanyReport);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    load({ data: { month } })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Não foi possível carregar os registros.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, revision, load]);
  return { data, error, loading };
}
