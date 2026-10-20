export type ResourceType =
  'PDF' | 'VIDEO' | 'AUDIO' | 'IMAGE' | 'INTERACTIVE' | 'LINK' | 'DOCUMENT' | 'OTHER';

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  PDF: 'PDF',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  IMAGE: 'Imagen',
  INTERACTIVE: 'Actividad interactiva',
  LINK: 'Enlace',
  DOCUMENT: 'Documento',
  OTHER: 'Otro',
};

export const RESOURCE_TYPES = Object.keys(RESOURCE_LABELS) as ResourceType[];

export interface Resource {
  id: number;
  title: string;
  type: ResourceType;
  url: string;
  lessonId: number;
}

export interface ResourceInput {
  title?: string;
  type?: ResourceType;
  url?: string;
}
