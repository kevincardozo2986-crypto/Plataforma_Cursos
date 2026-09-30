const valid = {
  firstName: 'Prueba', lastName: 'Postman',
  email: '{{email}}', password: 'PruebaLocal2026!', document: '{{document}}',
};

export const cases = [
  { name: '01 - Registro correcto', body: valid, status: 201 },
  { name: '02 - Correo duplicado', body: valid, status: 409 },
  { name: '03 - Correo duplicado en mayúsculas', body: { ...valid, email: '{{emailUpper}}' }, status: 409 },
  { name: '04 - Email inválido', body: { ...valid, email: 'correo-invalido' }, status: 400 },
  { name: '05 - Contraseña corta', body: { ...valid, password: '1234' }, status: 400 },
  { name: '06 - Nombre demasiado corto', body: { ...valid, firstName: 'A' }, status: 400 },
  { name: '07 - Campo obligatorio ausente', body: { lastName: 'Postman', email: '{{email}}', password: valid.password }, status: 400 },
  { name: '08 - No permitir rol ADMIN', body: { ...valid, role: 'ADMIN' }, status: 400 },
  { name: '09 - No permitir campos desconocidos', body: { ...valid, unexpected: true }, status: 400 },
  { name: '10 - Nombre con tipo incorrecto', body: { ...valid, firstName: 123 }, status: 400 },
  { name: '11 - Documento duplicado', body: { ...valid, email: '{{secondEmail}}' }, status: 409 },
  { name: '12 - Nombre compuesto solo por espacios', body: { ...valid, email: '{{thirdEmail}}', document: '{{otherDocument}}', firstName: '  ' }, status: 400 },
  { name: '13 - Documento ausente', body: { firstName: 'Prueba', lastName: 'Postman', email: '{{secondEmail}}', password: valid.password }, status: 400 },
  { name: '14 - Documento vacío', body: { ...valid, document: '' }, status: 400 },
  { name: '15 - Documento solo espacios', body: { ...valid, document: '   ' }, status: 400 },
  { name: '16 - Documento null', body: { ...valid, document: null }, status: 400 },
  { name: '17 - Documento duplicado con espacios', body: { ...valid, email: '{{secondEmail}}', document: '  {{document}}  ' }, status: 409 },
];
