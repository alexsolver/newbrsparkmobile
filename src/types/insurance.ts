export type InsurancePolicyType =
  // Imóvel
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'FIRE'
  | 'FLOOD'
  | 'LIABILITY'
  | 'CONDO'
  // Veículo
  | 'AUTO_COMPREHENSIVE'
  | 'THIRD_PARTY'
  | 'TOW_ASSISTANCE'
  | 'TRACKER'
  // Embarcação
  | 'HULL'
  | 'PI'          // P&I
  | 'DPEM'
  // Equipamento
  | 'EXTENDED_WARRANTY'
  | 'THEFT'
  | 'ALL_RISKS'
  // Genérico
  | 'CIVIL_LIABILITY'
  | 'PATRIMONIAL'
  | 'OTHER';

export interface InsurancePolicy {
  id: string;
  assetId: string;
  type: InsurancePolicyType;
  insurer: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  premiumValue: number;
  deductible: number;
  coverageAmount: number;
  coverageDetails: string;
  brokerName?: string;
  brokerPhone?: string;
  documentUri?: string;
  alertDaysBefore?: number;   // dias de antecedência para alerta (0=no dia, 1, 3, 5, 10, 30)
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
  ownerEmail?: string;
}

export const POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  FIRE: 'Incêndio',
  FLOOD: 'Alagamento',
  LIABILITY: 'Resp. Civil (Imóvel)',
  CONDO: 'Condomínio',
  AUTO_COMPREHENSIVE: 'Auto Compreensivo',
  THIRD_PARTY: 'Terceiros',
  TOW_ASSISTANCE: 'Guincho / Assistência',
  TRACKER: 'Rastreador',
  HULL: 'Casco (Embarcação)',
  PI: 'P&I (Responsabilidade)',
  DPEM: 'DPEM Marítimo',
  EXTENDED_WARRANTY: 'Garantia Estendida',
  THEFT: 'Furto / Roubo',
  ALL_RISKS: 'All Risks',
  CIVIL_LIABILITY: 'Responsabilidade Civil',
  PATRIMONIAL: 'Patrimonial',
  OTHER: 'Outro',
};

// Tipos disponíveis por tipo de ativo
const vehiclePolicies: InsurancePolicyType[] = ['AUTO_COMPREHENSIVE', 'THIRD_PARTY', 'TOW_ASSISTANCE', 'TRACKER', 'CIVIL_LIABILITY', 'OTHER'];
const equipmentPolicies: InsurancePolicyType[] = ['EXTENDED_WARRANTY', 'THEFT', 'ALL_RISKS', 'CIVIL_LIABILITY', 'PATRIMONIAL', 'OTHER'];

export const POLICY_TYPES_BY_ASSET: Record<string, InsurancePolicyType[]> = {
  REAL_ESTATE: ['RESIDENTIAL', 'COMMERCIAL', 'FIRE', 'FLOOD', 'LIABILITY', 'CONDO', 'PATRIMONIAL', 'OTHER'],
  TERRESTRIAL: vehiclePolicies,
  MOBILITY: vehiclePolicies,
  MACHINERY: equipmentPolicies,
  IT: equipmentPolicies,
  COLLECTIONS: equipmentPolicies,
  AQUATIC: ['HULL', 'PI', 'DPEM', 'ALL_RISKS', 'PATRIMONIAL', 'OTHER'],
  SPECIAL: equipmentPolicies,
  OTHER: equipmentPolicies,
};

export const POLICY_STATUS_CONFIG: Record<InsurancePolicy['status'], { label: string; color: string; bg: string; icon: string }> = {
  ACTIVE:        { label: 'Ativa',     color: '#059669', bg: '#ECFDF5', icon: 'shield-checkmark' },
  EXPIRING_SOON: { label: 'Vencendo',  color: '#D97706', bg: '#FFFBEB', icon: 'alert-circle' },
  EXPIRED:       { label: 'Vencida',   color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle' },
  CANCELLED:     { label: 'Cancelada', color: '#6B7280', bg: '#F3F4F6', icon: 'ban' },
};
