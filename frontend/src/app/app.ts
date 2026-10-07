import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AccessibilityMenu } from './shared/ui/accessibility-menu/accessibility-menu';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AccessibilityMenu],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
