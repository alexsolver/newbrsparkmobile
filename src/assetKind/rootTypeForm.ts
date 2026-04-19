/** Bloco de identificadores no formulário de cadastro (polimorfismo da ficha). */
export type AssetFormBlock = 'realEstate' | 'vehicleLike' | 'aquatic' | 'collectionLike' | 'generic';

export function getAssetFormBlock(type: string | null | undefined): AssetFormBlock {
  switch (type) {
    case 'REAL_ESTATE':
      return 'realEstate';
    case 'MOBILITY':
    case 'MACHINERY':
    case 'IT':
    case 'TERRESTRIAL':
      return 'vehicleLike';
    case 'AQUATIC':
      return 'aquatic';
    case 'COLLECTIONS':
    case 'SPECIAL':
      return 'collectionLike';
    default:
      return 'generic';
  }
}
