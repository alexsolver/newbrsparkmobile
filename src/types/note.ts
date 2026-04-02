export interface AssetNote {
  id: string;
  assetId: string;
  title: string;
  content: string; // Markdown supporting plain text and - [ ] checklists
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  synced: 0 | 1;
}
