import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PasswordRecovery } from './password-recovery';
describe('PasswordRecovery', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('requests a code without requiring a login and blocks duplicate submissions', () => {
    const page = TestBed.createComponent(PasswordRecovery).componentInstance;
    page.identifier = '123456';
    page.request();
    page.request();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/auth/recovery/request-code');
    expect(req.request.body).toEqual({ identifier: '123456' });
    req.flush({ challenge: 'a'.repeat(64), retryAfterSeconds: 60 });
    expect(page.challenge()).toHaveLength(64);
    expect(page.busy()).toBe(false);
  });
  it('does not submit mismatched passwords', () => {
    const page = TestBed.createComponent(PasswordRecovery).componentInstance;
    page.password = 'new-password';
    page.confirmation = 'different-pass';
    page.confirm();
    expect(page.error()).toContain('no coinciden');
    TestBed.inject(HttpTestingController).expectNone('/api/auth/recovery/confirm-code');
  });
  it('binds confirmation to the returned challenge and clears secrets after success', () => {
    const page = TestBed.createComponent(PasswordRecovery).componentInstance;
    page.challenge.set('a'.repeat(64));
    page.code = '123456';
    page.password = page.confirmation = 'new-password';
    page.confirm();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/auth/recovery/confirm-code');
    expect(req.request.body).toEqual({
      challenge: 'a'.repeat(64),
      code: '123456',
      newPassword: 'new-password',
    });
    req.flush({ changed: true });
    expect(page.done()).toBe(true);
    expect(page.password).toBe('');
    expect(page.code).toBe('');
  });
});
