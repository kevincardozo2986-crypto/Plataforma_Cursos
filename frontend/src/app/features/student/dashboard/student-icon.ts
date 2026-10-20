import { Component, input } from '@angular/core';

@Component({
  selector: 'app-student-icon',
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()] || paths[\'book\']" /></svg>',
  styles:
    ':host { display: inline-flex; width: 20px; height: 20px; flex-shrink: 0; } svg { width: 100%; height: 100%; }',
})
export class StudentIcon {
  readonly name = input('book');
  readonly paths: Record<string, string> = {
    home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
    book: 'M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1m0-16c3-2 7-2 10-1v16c-3-1-7-1-10 1V5Z',
    search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 14l-2 8 6-3 6 3-2-8m-6-5 2 2 3-3',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 13h6',
    user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    settings:
      'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    chevron: 'm6 9 6 6 6-6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M18 6 6 18',
    play: 'm9 5 11 7-11 7V5Z',
    check: 'm5 12 4 4L19 6',
    logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h14',
  };
}
