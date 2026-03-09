import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdrAnalysisResult } from '../../models/cdr-file.model';

@Component({
  selector: 'app-file-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-card.component.html',
  styleUrl: './file-card.component.css',
})
export class FileCardComponent {
  @Input() result!: CdrAnalysisResult;
  @Input() progress: number = 0;

  @Output() sendSummary = new EventEmitter<CdrAnalysisResult>();
  @Output() uploadFile = new EventEmitter<CdrAnalysisResult>();
  @Output() removeCard = new EventEmitter<string>();

  previewExpanded = signal(false);

  get fileSizeLabel(): string {
    const bytes = this.result.file.size;
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  get versionNum(): number {
    return parseFloat(this.result.meta?.appVersion ?? '0');
  }

  formatDim(val: number, unit: string, decimals = 2): string {
    return `${val.toFixed(decimals)} ${unit}`;
  }

  togglePreview() {
    this.previewExpanded.update((v) => !v);
  }
}
