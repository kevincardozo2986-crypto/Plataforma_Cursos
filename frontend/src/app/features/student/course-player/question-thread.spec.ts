import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QuestionThread } from './question-thread';
describe('Student question conversations', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('loads the replies for the selected question and allows participation', () => {
    const fixture = TestBed.createComponent(QuestionThread);
    fixture.componentRef.setInput('postId', 7);
    const component = fixture.componentInstance;
    component.toggle();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/discussions/7')
      .flush({ replies: [{ id: 1, body: 'Respuesta del docente' }] });
    expect(component.replies()[0].body).toContain('docente');
    component.body = 'Mi duda es esta';
    component.send();
    component.send();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/discussions/7/replies');
    expect(request.request.body).toEqual({ body: 'Mi duda es esta' });
    request.flush({ id: 2, body: 'Mi duda es esta' });
    expect(component.replies()).toHaveLength(2);
    expect(component.body).toBe('');
  });
});
