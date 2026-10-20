import { SiteFooter } from '../../../shared/layout/site-footer/site-footer';
import { Component } from '@angular/core';
import { Hero } from '../components/hero/hero';
import { ContinuingLearning } from '../components/continuing-learning/continuing-learning';
import { CertificatesSection } from '../components/certificates-section/certificates-section';

@Component({
  selector: 'app-home-page',
  imports: [Hero, ContinuingLearning, CertificatesSection, SiteFooter],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {}
