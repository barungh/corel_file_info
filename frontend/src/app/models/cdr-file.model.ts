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
  lastAuthor?: string;
  uuid?: string;
  createdDate?: string;
  modifyDate?: string;
  bitmapCount?: number;
  curveCount?: number;
  totalObjects?: number;
  fileSizeBytes?: number;
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
  last_author: string;
  uuid: string;
  created_date: string;
  modify_date: string;
  bitmap_count: number;
  curve_count: number;
  total_objects: number;
  file_size_bytes: number;
}

export interface AnalyzeRequestDto {
  filename: string;
  metadata_dims: string;
  page_count: number;
}
