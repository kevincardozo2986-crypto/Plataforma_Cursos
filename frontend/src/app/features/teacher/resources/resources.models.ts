export type ResourceType = 'PDF' | 'VIDEO' | 'LINK' | 'DOCUMENT' | 'OTHER';

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  PDF: 'PDF',
  VIDEO: 'Video',
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
