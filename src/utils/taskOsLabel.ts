/**
 * Número FT, RT convencional ou recorte do id técnico (cartões / cabeçalhos).
 */
export function taskOsLabel(task: {
  osNumber?: string | null;
  routineTaskNumber?: string | null;
  id: string;
}): string {
  const rt = task.routineTaskNumber;
  if (rt != null && String(rt).trim() !== '') return String(rt).trim();
  const raw = task.osNumber;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  const id = String(task.id);
  return id.split('_').pop()?.substring(0, 12) || id.substring(0, 12);
}
