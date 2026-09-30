import {
  Component,
  input,
} from '@angular/core';

export interface Course {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  duration: string;
  level: string;
  price: number;
  rating?: number;
}

@Component({
  selector: 'app-course-card',
  imports: [],
  templateUrl: './course-card.html',
  styleUrl: './course-card.scss',
})
export class CourseCard {
  readonly course = input<Course>({
    id: '1',
    title: 'Introducción al desarrollo web',
    category: 'Tecnología',
    description:
      'Aprende los fundamentos para crear experiencias web modernas y profesionales.',
    image: '/images/prueba1.png',
    duration: '20 horas',
    level: 'Básico',
    price: 120000,
    rating: 4.8,
  });

  formatPrice(price: number): string {
    return new Intl.NumberFormat(
      'es-CO',
      {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      },
    ).format(price);
  }
}