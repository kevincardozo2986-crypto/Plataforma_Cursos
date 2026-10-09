import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'courses', renderMode: RenderMode.Client },
  { path: 'courses/:id', renderMode: RenderMode.Client },
  // El código del certificado llega en la dirección: se consulta en el navegador.
  { path: 'verificar/:code', renderMode: RenderMode.Client },
  // Áreas autenticadas: la sesión vive en el navegador, no se pre-renderizan.
  {
    path: 'teacher/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
