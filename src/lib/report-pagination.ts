export async function collectPages<T>(
  fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const result = await fetchPage(start, start + 999);
    if (result.error || !result.data)
      throw new Error("Não foi possível carregar todos os registros. Tente atualizar o relatório.");
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}
