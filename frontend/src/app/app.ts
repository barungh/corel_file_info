import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { DropZoneComponent } from './components/drop-zone/drop-zone.component';
import { FileCardComponent } from './components/file-card/file-card.component';
import { PreviewModalComponent } from './components/preview-modal/preview-modal.component';
import { CdrParserService } from './services/cdr-parser.service';
import { ApiService } from './services/api.service';
import { CdrAnalysisResult } from './models/cdr-file.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    DropZoneComponent,
    FileCardComponent,
    PreviewModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  results = signal<CdrAnalysisResult[]>([]);
  progressMap = signal<Record<string, number>>({});
  pendingUpload = signal<CdrAnalysisResult | null>(null);
  toastMessage = signal<string | null>(null);
  toastType = signal<'success' | 'error'>('success');

  doneCount = computed(() => this.results().filter((r) => r.status === 'done').length);
  errorCount = computed(() => this.results().filter((r) => r.status === 'error').length);
  incompatibleCount = computed(() => this.results().filter((r) => r.status === 'done' && !r.compatible).length);
  mismatchCount = computed(() => this.results().filter((r) => r.dimensionMismatch).length);
  eyelidCount = computed(() => this.results().filter((r) => r.filenameInfo?.hasFinishingAlert).length);

  constructor(
    private parser: CdrParserService,
    private api: ApiService,
  ) {
    // Subscribe to worker progress events
    this.parser.progress$.subscribe(({ id, progress }) => {
      this.progressMap.update((map) => ({ ...map, [id]: progress }));
    });
  }

  async onFilesSelected(files: File[]) {
    const newResults: CdrAnalysisResult[] = files.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: 'processing' as const,
    }));

    this.results.update((r) => [...r, ...newResults]);

    // Process files in parallel (each spawns a message to the shared worker)
    for (const result of newResults) {
      this.parser.analyzeFile(result).then((updated) => {
        // Mark local analysis done
        this.results.update((arr) =>
          arr.map((r) => (r.id === updated.id ? { ...updated, aiLoading: true } : r))
        );
        // Immediately kick off AI analysis if metadata is available
        if (updated.meta) {
          const dims = `${updated.meta.widthInches.toFixed(2)}x${updated.meta.heightInches.toFixed(2)}`;
          this.api.analyzeFile({
            filename: updated.file.name,
            metadata_dims: dims,
            page_count: updated.meta.numPages || 1,
          }).subscribe({
            next: (aiResult) => {
              this.results.update((arr) =>
                arr.map((r) => r.id === updated.id ? { ...r, aiLoading: false, aiResult } : r)
              );
            },
            error: (e) => {
              this.results.update((arr) =>
                arr.map((r) => r.id === updated.id
                  ? { ...r, aiLoading: false, aiError: e.message ?? 'AI analysis failed' }
                  : r)
              );
            },
          });
        }
      }).catch((err) => {
        this.results.update((arr) =>
          arr.map((r) =>
            r.id === result.id
              ? { ...r, status: 'error', error: err.message }
              : r
          )
        );
      });
    }
  }

  onRemoveCard(id: string) {
    this.results.update((arr) => arr.filter((r) => r.id !== id));
  }

  onSendSummary(result: CdrAnalysisResult) {
    const dto = this.parser.buildSummaryDto(result);
    if (!dto) return;
    this.api.sendSummary(dto).subscribe({
      next: () => {
        this.results.update((arr) =>
          arr.map((r) => (r.id === result.id ? { ...r, summarySubmitted: true } : r))
        );
        this.showToast('Summary sent to server!', 'success');
      },
      error: (e) => {
        this.showToast(`Failed to send summary: ${e.message}`, 'error');
      },
    });
  }

  onUploadFile(result: CdrAnalysisResult) {
    this.pendingUpload.set(result);
  }

  onModalConfirmed() {
    const result = this.pendingUpload();
    if (!result) return;
    this.pendingUpload.set(null);

    this.api.uploadFile(result.file).subscribe({
      next: (res) => {
        this.results.update((arr) =>
          arr.map((r) => (r.id === result.id ? { ...r, fileUploaded: true } : r))
        );
        this.showToast(`File uploaded: ${res.filename} (${res.size_mb} MB)`, 'success');
      },
      error: (e) => {
        this.showToast(`Upload failed: ${e.message}`, 'error');
      },
    });
  }

  onModalCancelled() {
    this.pendingUpload.set(null);
  }

  clearAll() {
    this.results.set([]);
    this.progressMap.set({});
  }

  getProgress(id: string): number {
    return this.progressMap()[id] ?? 0;
  }

  trackById(_: number, r: CdrAnalysisResult): string {
    return r.id;
  }

  private showToast(message: string, type: 'success' | 'error') {
    this.toastMessage.set(message);
    this.toastType.set(type);
    setTimeout(() => this.toastMessage.set(null), 4000);
  }
}
