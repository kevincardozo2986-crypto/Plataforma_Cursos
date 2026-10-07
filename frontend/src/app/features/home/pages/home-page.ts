import { Component } from '@angular/core';
import { Hero } from '../components/hero/hero';
import { ContinuingLearning } from '../components/continuing-learning/continuing-learning';
import { FeaturedCoursesCarousel } from '../components/featured-courses-carousel/featured-courses-carousel';

@Component({
  selector: 'app-home-page',
  imports: [Hero, ContinuingLearning, FeaturedCoursesCarousel],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {}
