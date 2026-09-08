export interface AnalysisResult {
  summary: string;
  parameters: { name: string; value: string | null }[];
  buyerTerms?: string;
  fileName: string;
  filePath: string;
}

export interface SavedBid {
  id: string;
  gemOrderId: string | null;
  title: string;
  fileName: string;
  filePath: string;
  uploadedBy: string | null;
  offeredProduct: string | null;
  categoryCode?: string | null;
  buyerTerms?: string | null;
  extractedSummary?: string | null;
  bidStatus?: string | null;
  parameters?: { id: number; parameterName: string; parameterValue: string | null }[];
  createdOn: string;
}
