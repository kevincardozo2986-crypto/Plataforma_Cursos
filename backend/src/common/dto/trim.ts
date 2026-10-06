import { Transform } from 'class-transformer';

/** Recorta espacios de un texto o de cada texto de una lista. */
export const Trim = () =>
  Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.trim();
    }

    return Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
      : value;
  });
