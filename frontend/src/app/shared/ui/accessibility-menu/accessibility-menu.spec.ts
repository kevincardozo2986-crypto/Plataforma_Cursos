import { TestBed } from '@angular/core/testing';
import { AccessibilityMenu } from './accessibility-menu';
import { AccessibilityService } from '../../../core/accessibility/accessibility.service';

describe('Global accessibility', () => {
  beforeEach(() => {
    localStorage.removeItem('campus.accessibility');
    document.documentElement.classList.remove('a11y-dark', 'a11y-large-text', 'a11y-contrast');
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('campus.accessibility');
    document.documentElement.classList.remove('a11y-dark', 'a11y-large-text', 'a11y-contrast');
  });
  it('applies preferences to the entire document and persists them', async () => {
    const fixture = TestBed.createComponent(AccessibilityMenu);
    fixture.detectChanges();
    await fixture.whenStable();
    const settings = TestBed.inject(AccessibilityService);
    settings.contrast.set(true);
    settings.largeText.set(true);
    settings.darkMode.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.documentElement.classList.contains('a11y-contrast')).toBe(true);
    expect(document.documentElement.classList.contains('a11y-large-text')).toBe(true);
    expect(document.documentElement.classList.contains('a11y-dark')).toBe(true);
    expect(JSON.parse(localStorage.getItem('campus.accessibility')!)).toEqual({
      contrast: true,
      largeText: true,
      darkMode: true,
    });
    settings.reset();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.documentElement.classList.contains('a11y-contrast')).toBe(false);
  });
  it('restores saved settings and returns focus on Escape', async () => {
    localStorage.setItem('campus.accessibility', JSON.stringify({ largeText: true }));
    const fixture = TestBed.createComponent(AccessibilityMenu);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(TestBed.inject(AccessibilityService).largeText()).toBe(true);
    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#access-options')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#access-options')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
