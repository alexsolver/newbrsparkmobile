/**
 * Catálogo embutido quando ainda não houve sync de /api/config (mesmas chaves do seed do admin).
 */
export const TECHNICIAN_EXPENSE_CATEGORIES_FALLBACK = [
  { id: 'combustivel', label: 'Combustível', icon: 'flash-outline', color: '#EA580C' },
  { id: 'estacionamento', label: 'Estacionamento', icon: 'business-outline', color: '#64748B' },
  { id: 'pedagio', label: 'Pedágio / pedágios', icon: 'ticket-outline', color: '#7C3AED' },
  {
    id: 'transporte_publico_taxi_app',
    label: 'Transporte público / táxi / app',
    icon: 'bus-outline',
    color: '#2563EB',
  },
  { id: 'materiais_consumiveis', label: 'Materiais / consumíveis', icon: 'cube-outline', color: '#0D9488' },
  { id: 'pecas_antecipadas', label: 'Peças antecipadas', icon: 'hardware-chip-outline', color: '#0891B2' },
  {
    id: 'servicos_terceiros_obra',
    label: 'Serviços de terceiros na obra',
    icon: 'people-outline',
    color: '#4F46E5',
  },
  { id: 'alimentacao', label: 'Refeição / alimentação', icon: 'restaurant-outline', color: '#D97706' },
  { id: 'hospedagem', label: 'Hospedagem', icon: 'bed-outline', color: '#9333EA' },
  {
    id: 'ferramentas_equipamento',
    label: 'Ferramentas / equipamento',
    icon: 'construct-outline',
    color: '#475569',
  },
  { id: 'epi', label: 'EPI', icon: 'shield-checkmark-outline', color: '#059669' },
  { id: 'taxas_multas', label: 'Taxas / multas', icon: 'warning-outline', color: '#DC2626' },
  {
    id: 'comunicacao',
    label: 'Comunicação (dados, SIM)',
    icon: 'phone-portrait-outline',
    color: '#0284C7',
  },
  { id: 'outros', label: 'Outros', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
] as const;
