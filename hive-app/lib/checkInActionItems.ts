/** Fetch the whole scoped task list, including items past the first API page. */
export async function fetchCheckInActionItems<T>(query: () => any): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const result = await query().range(offset, offset + pageSize - 1);
    if (result.error) return { data: [], error: result.error };
    const rows = (result.data ?? []) as T[];
    data.push(...rows);
    if (rows.length < pageSize) return { data, error: null };
  }
}
