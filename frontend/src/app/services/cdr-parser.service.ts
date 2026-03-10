import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {
  CdrAnalysisResult,
  FilenameInfo,
  FileSummaryDto,
} from '../models/cdr-file.model';

@Injectable({ providedIn: 'root' })
export class CdrParserService {
  // Emits progress updates keyed by file id
  progress$ = new Subject<{ id: string; progress: number }>();

  private worker: Worker | null = null;
  private pendingCallbacks = new Map<
    string,
    { resolve: (r: any) => void; reject: (e: any) => void }
  >();

  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../workers/cdr-analysis.worker', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event) => this.handleWorkerMessage(event);
      this.worker.onerror = (err) => {
        console.error('Worker error:', err);
      };
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { type, id, payload, progress } = event.data;
    if (type === 'progress') {
      this.progress$.next({ id, progress });
      return;
    }
    const cb = this.pendingCallbacks.get(id);
    if (!cb) return;
    this.pendingCallbacks.delete(id);
    if (type === 'result') {
      cb.resolve(payload);
    } else {
      cb.reject(new Error(payload?.message || 'Worker error'));
    }
  }

  async analyzeFile(result: CdrAnalysisResult): Promise<CdrAnalysisResult> {
    if (!this.worker) {
      return { ...result, status: 'error', error: 'Web Workers not supported in this browser.' };
    }

    const arrayBuffer = await result.file.arrayBuffer();

    const workerResult = await new Promise<any>((resolve, reject) => {
      this.pendingCallbacks.set(result.id, { resolve, reject });
      this.worker!.postMessage(
        { id: result.id, arrayBuffer, filename: result.file.name },
        [arrayBuffer]
      );
    });

    const meta = {
      filename: result.file.name,
      appVersion: workerResult.appVersion,
      numPages: workerResult.numPages,
      rawWidth: workerResult.rawWidth,
      rawHeight: workerResult.rawHeight,
      widthInches: workerResult.widthInches,
      heightInches: workerResult.heightInches,
      widthFeet: workerResult.widthFeet,
      heightFeet: workerResult.heightFeet,
      previewUrl: workerResult.previewBase64
        ? `data:image/png;base64,${workerResult.previewBase64}`
        : null,
      lastAuthor: workerResult.lastAuthor,
      uuid: workerResult.uuid,
      createdDate: workerResult.createdDate,
      modifyDate: workerResult.modifyDate,
      bitmapCount: workerResult.bitmapCount,
      curveCount: workerResult.curveCount,
      totalObjects: workerResult.totalObjects,
      fileSizeBytes: workerResult.fileSizeBytes,
    };

    const filenameInfo = this.parseFilename(result.file.name);
    const compatible = this.isCompatible(meta.appVersion);
    const dimensionMismatch = this.checkDimensionMismatch(meta, filenameInfo);

    return {
      ...result,
      status: 'done',
      meta,
      filenameInfo,
      compatible,
      dimensionMismatch,
    };
  }

  parseFilename(filename: string): FilenameInfo {
    // Extract WxH from filename e.g. "5x3 Shirt (R).cdr" → width=5, height=3
    const dimMatch = filename.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    const hasFinishingAlert = filename.includes('(R)');

    if (dimMatch) {
      return {
        width: parseFloat(dimMatch[1]),
        height: parseFloat(dimMatch[2]),
        raw: `${dimMatch[1]}x${dimMatch[2]}`,
        hasFinishingAlert,
      };
    }
    return { width: null, height: null, raw: null, hasFinishingAlert };
  }

  isCompatible(version: string): boolean {
    const versionNum = parseFloat(version);
    if (isNaN(versionNum)) return true; // Can't determine, assume ok
    return versionNum >= 17.0;
  }

  checkDimensionMismatch(
    meta: { widthInches: number; heightInches: number },
    filenameInfo: FilenameInfo
  ): boolean {
    if (filenameInfo.width === null || filenameInfo.height === null) return false;
    // Allow 5% tolerance for floating-point and rounding differences
    const tolerance = 0.05;
    const wDiff = Math.abs(meta.widthInches - filenameInfo.width);
    const hDiff = Math.abs(meta.heightInches - filenameInfo.height);
    return wDiff > tolerance || hDiff > tolerance;
  }

  buildSummaryDto(result: CdrAnalysisResult): FileSummaryDto | null {
    if (!result.meta) return null;
    const { meta, filenameInfo, compatible, dimensionMismatch } = result;
    return {
      filename: meta.filename,
      version: meta.appVersion,
      pages: meta.numPages,
      width_inches: parseFloat(meta.widthInches.toFixed(4)),
      height_inches: parseFloat(meta.heightInches.toFixed(4)),
      width_feet: parseFloat(meta.widthFeet.toFixed(4)),
      height_feet: parseFloat(meta.heightFeet.toFixed(4)),
      compatible: compatible ?? true,
      needs_eyelids: filenameInfo?.hasFinishingAlert ?? false,
      dimension_mismatch: dimensionMismatch ?? false,
      filename_dims: filenameInfo?.raw ?? null,
      metadata_dims:
        meta.widthInches > 0
          ? `${meta.widthInches.toFixed(2)}x${meta.heightInches.toFixed(2)}`
          : null,
      last_author: meta.lastAuthor || '',
      uuid: meta.uuid || '',
      created_date: meta.createdDate || '',
      modify_date: meta.modifyDate || '',
      bitmap_count: meta.bitmapCount || 0,
      curve_count: meta.curveCount || 0,
      total_objects: meta.totalObjects || 0,
      file_size_bytes: meta.fileSizeBytes || 0,
    };
  }
}
