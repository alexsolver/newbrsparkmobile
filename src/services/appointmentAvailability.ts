import { apiFetch } from './auth';

const SLOT = 30;

export type CartLine = { service: { id: string; duration_minutes?: number | null }; qty: number };

/** Soma durações (min) por quantidade, arredondada a múltiplos de 30 (mín. 30, máx. 1440). */
export function totalDurationMinutesForCart(cart: CartLine[]): { minutes: number; serviceId: string | undefined } {
  let sum = 0;
  for (const line of cart) {
    const d = Number(line.service?.duration_minutes);
    const unit = Number.isFinite(d) && d > 0 ? d : 60;
    sum += unit * (line.qty || 1);
  }
  const rounded = Math.max(SLOT, Math.ceil(sum / SLOT) * SLOT);
  return {
    minutes: Math.min(1440, rounded),
    serviceId: cart[0]?.service?.id,
  };
}
