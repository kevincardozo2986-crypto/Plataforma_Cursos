export interface Course {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  price?: number | string | null;

  /** BEGINNER | INTERMEDIATE | ADVANCED */
  level?: string;
  imageUrl?: string | null;
  introVideoUrl?: string | null;
  _count?: { modules: number };

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
