export interface SylkRecord {
  date: Date;
  marketName: string;
  marketCode: string;
  stage: string;
  labelName: string;
  unit: string;
  avgPrice: number;
  minPrice?: number;
  maxPrice?: number;
  variation?: number;
}

export interface NormalizedProductInfo {
  originalLabel: string;
  normalizedLabel: string;
  productSlug: string;
  cleanUnit: string;
}

export interface MarketTrendReport {
  labelName: string;
  marketName: string;
  stage: string;
  currentPrice: number;
  date: string;
  variation1d: number;
  variation7d: number;
  variation30d: number;
  variation1y: number;
}

export interface SyncStats {
  especeId: number;
  productName: string;
  downloadedBytes: number;
  parsedRecordsCount: number;
  insertedRecordsCount: number;
  error?: string;
}
