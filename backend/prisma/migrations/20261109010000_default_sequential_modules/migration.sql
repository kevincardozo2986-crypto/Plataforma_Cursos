-- Los cursos nuevos abren cada módulo al terminar el anterior (los existentes no cambian).
ALTER TABLE "courses" ALTER COLUMN "dripType" SET DEFAULT 'SEQUENTIAL';
