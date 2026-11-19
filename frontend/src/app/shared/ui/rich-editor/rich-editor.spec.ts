import { TestBed } from '@angular/core/testing';
import { RichEditor } from './rich-editor';
import { UploadsService } from '../../../core/uploads/uploads.service';

describe('RichEditor', () => {
  it('no emite cambios de formulario al alternar modos sin editar el código', async () => {
    await TestBed.configureTestingModule({
      imports: [RichEditor],
      providers: [{ provide: UploadsService, useValue: {} }],
    }).compileComponents();

    const fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('inputId', 'lesson-content');
    fixture.detectChanges();

    const changes: string[] = [];
    const editor = fixture.componentInstance;

    editor.registerOnChange((value) => changes.push(value));
    editor.writeValue('<p>Contenido sin cambios</p>');
    editor.show('code');
    fixture.detectChanges();
    editor.show('visual');
    fixture.detectChanges();

    expect(changes).toEqual([]);
    fixture.destroy();
  });
});
