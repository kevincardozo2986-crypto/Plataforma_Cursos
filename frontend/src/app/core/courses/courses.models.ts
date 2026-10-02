export interface Course {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  price?: number | string | null;

  category?: {
    id?: string;
    name?: string;
  } | null;

  [key: string]: unknown;
}

export interface CoursesResponse {
  data: Course[];
  total: number;
  page: number;
  limit: number;
}