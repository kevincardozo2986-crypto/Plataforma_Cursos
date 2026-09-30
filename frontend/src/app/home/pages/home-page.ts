import { Component } from '@angular/core';

import {
  Navbar,
} from '../components/navbar/navbar';

import {
  Hero,
} from '../components/hero/hero';

import {
  CourseCard,
} from '../components/course-card/course-card';

@Component({
  selector: 'app-home-page',

  imports: [
    Navbar,
    Hero,
    CourseCard,
  ],

  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {}