export interface CdrFileMeta {
  filename: string;
  appVersion: string;
  numPages: number;
  rawWidth: number;   // 1/10th micron
  rawHeight: number;  // 1/10th micron
  widthInches: number;
  heightInches: number;
  widthFeet: number;
  heightFeet: number;
  previewUrl: string | null;
}

export interface FilenameInfo {
  width: number | null;
  height: number | null;
  raw: string | null;
  hasFinishingAlert: boolean;
}

export interface AiAnalysisResult {
  dims: string;
  material: string;
  total_qty: string;
  eyelids: boolean;
  substrate: string;
  lamination: string;
  alerts: string[];
}

export interface CdrAnalysisResult {
  id: string;
  file: File;
  status: 'processing' | 'done' | 'error';
  error?: string;
  meta?: CdrFileMeta;
  filenameInfo?: FilenameInfo;
  compatible?: boolean;
  dimensionMismatch?: boolean;
  summarySubmitted?: boolean;
  fileUploaded?: boolean;
  // AI analysis
  aiResult?: AiAnalysisResult;
  aiLoading?: boolean;
  aiError?: string;
}

export interface WorkerMessage {
  type: 'result' | 'error' | 'progress';
  id: string;
  payload?: any;
  progress?: number;
}

export interface FileSummaryDto {
  filename: string;
  version: string;
  pages: number;
  width_inches: number;
  height_inches: number;
  width_feet: number;
  height_feet: number;
  compatible: boolean;
  needs_eyelids: boolean;
  dimension_mismatch: boolean;
  filename_dims: string | null;
  metadata_dims: string | null;
}

export interface AnalyzeRequestDto {
  filename: string;
  metadata_dims: string;
  page_count: number;
}
