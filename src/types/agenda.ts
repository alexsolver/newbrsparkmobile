export type EventCategory = 'BOOKING' | 'MAINTENANCE' | 'FINANCE' | 'INSURANCE' | 'TASK' | 'MEETING';

export interface AgendaEvent {
  id: string;
  /** Número convencional da OS (ex. FT-2026-04-0000001), quando vindo da nuvem */
  osNumber?: string | null;
  assetId?: string;       // Optional: tied to a specific asset
  title: string;
  description?: string;
  category: EventCategory;
  
  startDate: string;      // Format: YYYY-MM-DD
  endDate: string;        // Format: YYYY-MM-DD
  
  color?: string;         // Hex color for rendering
  isAllDay?: boolean;
  
  // Tracking
  source: 'MANUAL' | 'COST' | 'INSURANCE' | 'CHECKLIST'; 
  refId?: string;         // Link to original Expense or Policy ID if it's aggregated
  ownerEmail: string;     // Must be multi-tenant safe

  /** Tipo de local de atendimento (execução checklist na nuvem): radius, segment, route, polygon, none. */
  locationZoneType?: string | null;

  /** ISO — início do bloco na agenda (OS com despacho planeado). */
  agendaStartAt?: string | null;
  /** ISO — fim do bloco (início + duração prevista do formulário). */
  agendaEndAt?: string | null;
  /** Snapshot: minutos previstos só do formulário (sem deslocamento). */
  expectedFormDurationMinutes?: number | null;
  /** Sobreposição com outra OS do mesmo utilizador no mesmo intervalo. */
  agendaOverlap?: boolean;
}

// Visual helpers for the UI mapping
export interface MarkedDateProps {
  startingDay?: boolean;
  endingDay?: boolean;
  color?: string;
  textColor?: string;
  marked?: boolean;
  dotColor?: string;
}
