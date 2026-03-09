import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdrAnalysisResult } from '../../models/cdr-file.model';

@Component({
  selector: 'app-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview-modal.component.html',
  styleUrl: './preview-modal.component.css',
})
export class PreviewModalComponent {
  @Input() result!: CdrAnalysisResult;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  getSummaryJson(): string {
    if (!this.result) return '';
    const r = this.result;
    const m = r.meta!;
    return JSON.stringify({
      filename: m.filename,
      version: m.appVersion,
      pages: m.numPages,
      width_inches: m.widthInches.toFixed(4),
      height_inches: m.heightInches.toFixed(4),
      width_feet: m.widthFeet.toFixed(4),
      height_feet: m.heightFeet.toFixed(4),
      compatible: r.compatible,
      needs_eyelids: r.filenameInfo?.hasFinishingAlert ?? false,
      dimension_mismatch: r.dimensionMismatch,
    }, null, 2);
  }
}
