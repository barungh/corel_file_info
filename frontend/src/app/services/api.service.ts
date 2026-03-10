import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FileSummaryDto, AnalyzeRequestDto, AiAnalysisResult } from '../models/cdr-file.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly BASE = '';

  constructor(private http: HttpClient) {}

  sendSummary(summary: FileSummaryDto): Observable<any> {
    return this.http.post(`${this.BASE}/api/summary`, summary);
  }

  analyzeFile(req: AnalyzeRequestDto): Observable<AiAnalysisResult> {
    return this.http.post<AiAnalysisResult>(`${this.BASE}/api/analyze`, req);
  }

  uploadFile(file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post(`${this.BASE}/api/upload`, form);
  }
}
