import { Component, input } from '@angular/core';

@Component({
  selector: 'app-streak-flame',
  host: { 'aria-hidden': 'true', '[class.resting]': '!active()' },
  template: `
    <svg viewBox="0 0 72 88" fill="none" aria-hidden="true" focusable="false">
      <g class="flame-body">
        <path
          class="flame-shell"
          d="M39 4c3 17-7 23-5 32 7-4 12-11 13-19 13 14 20 28 17 42-3 16-15 24-29 24C17 83 6 72 7 57c1-11 6-20 15-28-2 12 0 18 5 21C24 29 37 22 39 4Z"
          fill="#ff962e"
        />
        <path
          d="M38 32c1 12-8 17-8 28 5-3 8-7 9-12 12 12 16 29-3 33-18 0-24-13-18-25 1 8 4 10 7 12-3-17 8-23 13-36Z"
          fill="#ffcd62"
        />
        <ellipse cx="22" cy="65" rx="5" ry="3" fill="#ff773c" opacity=".65" />
        <ellipse cx="51" cy="65" rx="5" ry="3" fill="#ff773c" opacity=".65" />
        <g class="flame-eyes" fill="#17314c">
          <ellipse cx="27" cy="56" rx="3.2" ry="4.8" />
          <ellipse cx="45" cy="56" rx="3.2" ry="4.8" />
          <circle cx="28" cy="54.5" r="1" fill="white" />
          <circle cx="46" cy="54.5" r="1" fill="white" />
        </g>
        <path
          class="flame-smile"
          d="M31 66q5 6 10 0"
          stroke="#17314c"
          stroke-width="2.6"
          stroke-linecap="round"
        />
      </g>
      <path class="spark spark-one" d="m9 18 2-5 2 5-2 5Z" fill="#ffd06b" />
      <circle class="spark spark-two" cx="59" cy="29" r="2" fill="#ffb347" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      width: 48px;
      height: 58px;
      flex-shrink: 0;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .flame-body {
      transform-origin: 36px 79px;
    }
    .flame-eyes {
      transform-box: fill-box;
      transform-origin: center;
    }
    .spark {
      opacity: 0;
    }
    :host(.resting) .flame-shell {
      fill: #ec994c;
    }
    :host(.resting) svg {
      filter: saturate(0.75);
    }
    @media (prefers-reduced-motion: no-preference) {
      .flame-body {
        animation: flame-dance 3s ease-in-out infinite;
      }
      .flame-eyes {
        animation: flame-blink 4.6s infinite;
      }
      .spark {
        animation: flame-spark 2.8s ease-out infinite;
      }
      .spark-two {
        animation-delay: 1.4s;
      }
      :host(.resting) .flame-body {
        animation-duration: 4.5s;
      }
      :host(:hover) .flame-body {
        animation-duration: 1.2s;
      }
    }
    @keyframes flame-dance {
      0%,
      100% {
        transform: translateY(0) rotate(-4deg) scale(1);
      }
      35% {
        transform: translateY(-5px) rotate(4deg) scale(0.97, 1.04);
      }
      70% {
        transform: translateY(-2px) rotate(-2deg) scale(1.03, 0.98);
      }
    }
    @keyframes flame-blink {
      0%,
      41%,
      45%,
      72%,
      76%,
      100% {
        transform: scaleY(1);
      }
      43%,
      74% {
        transform: scaleY(0.08);
      }
    }
    @keyframes flame-spark {
      0% {
        opacity: 0;
        transform: translateY(8px) scale(0.5);
      }
      30% {
        opacity: 0.8;
      }
      80%,
      100% {
        opacity: 0;
        transform: translateY(-12px) scale(0.4);
      }
    }
  `,
})
export class StreakFlame {
  readonly active = input(true);
}
