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
