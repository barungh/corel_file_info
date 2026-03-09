import {
  Component,
  EventEmitter,
  Output,
  HostListener,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-drop-zone',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './drop-zone.component.html',
  styleUrl: './drop-zone.component.css',
})
export class DropZoneComponent {
  @Output() filesSelected = new EventEmitter<File[]>();

  isDragging = signal(false);

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      this.isDragging.set(false);
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = this.filterCdrFiles(event.dataTransfer?.files ?? null);
    if (files.length) this.filesSelected.emit(files);
  }

  onFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = this.filterCdrFiles(input.files);
    if (files.length) this.filesSelected.emit(files);
    input.value = '';
  }

  private filterCdrFiles(fileList: FileList | null): File[] {
    if (!fileList) return [];
    return Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith('.cdr')
    );
  }

  triggerInput() {
    document.getElementById('file-input')?.click();
  }
}
