import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface Streak {
  days: number;
  studiedToday: boolean;
  week: { date: string; completed: boolean; today: boolean }[];
}
@Component({
  selector: 'app-study-streak',
  templateUrl: './study-streak.html',
  styleUrl: './study-streak.scss',
})
export class StudyStreak {
  readonly streak = signal<Streak | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly week = computed(() => {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const today = new Date(date + 'T12:00:00Z');
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setUTCDate(monday.getUTCDate() + index);
      const key = day.toISOString().slice(0, 10);
      return {
        date: key,
        today: key === date,
        completed: this.streak()?.week.some((item) => item.date === key && item.completed) ?? false,
      };
    });
  });
  constructor() {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.http
      .get<Streak>('/api/enrollments/streak')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.streak.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
  dayLabel(date: string): string {
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][
      new Date(date + 'T12:00:00Z').getUTCDay()
    ];
  }
}
