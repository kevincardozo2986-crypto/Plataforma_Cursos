import { t, section, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll } from './fixtures.mjs';

export default async function payments(ctx) {
  const { t1, s1, s2, s3 } = ctx;
  section('12. Pagos simulados');
  const paid = await buildCourse(t1, { title: `De pago ${ctx.run}`, patch: { price: 50000 }, lessons: 1 });
  const card = (n, extra = {}) => ({ cardHolder: 'Ana Ruiz', cardNumber: n, expMonth: 12, expYear: 30, cvv: '123', ...extra });
  const pay = (user, body, id = paid.id) => req('POST', `/courses/${id}/checkout`, { token: user.token, body });

  await t('Un curso de pago no admite inscripción directa (402)', async () => { is(await enroll(s1, paid), 402); });
  await t('Tarjeta que no pasa Luhn → 400', async () => { is(await pay(s1, card('4242 4242 4242 4241')), 400); });
  await t('Tarjeta vencida → 400; CVV inválido → 400', async () => {
    is(await pay(s1, card('4242 4242 4242 4242', { expYear: 20 })), 400);
    is(await pay(s1, card('4242 4242 4242 4242', { cvv: '12' })), 400);
  });
  await t('El importe lo decide el servidor: enviar "amount" → 400', async () => { is(await pay(s1, card('4242 4242 4242 4242', { amount: 1 })), 400); });
  await t('Tarjeta rechazada (fondos insuficientes): DECLINED, no se inscribe, deja comprobante', async () => {
    const r = is(await pay(s1, card('4000 0000 0000 0002')), 200, 201).body;
    eq(r.status, 'DECLINED');
    eq(r.enrolled, false);
    ok(r.payment.reference && /^PAY-/.test(r.payment.reference));
    is(await req('GET', `/lessons/${paid.lessons[0].id}`, { token: s1.token }), 403);
  });
  await t('Pago aprobado: APPROVED, queda inscrito y solo se guardan marca y últimos 4', async () => {
    const r = is(await pay(s1, card('4242 4242 4242 4242')), 200, 201);
    eq(r.body.status, 'APPROVED');
    eq(r.body.enrolled, true);
    eq(r.body.payment.cardLast4, '4242');
    ok(!/4242 4242 4242 4242|4242424242424242|"cvv"/.test(r.text), 'la respuesta trae el número completo o el CVV');
    const row = (await (await import('./harness.mjs').then((h) => h.db())).query('SELECT * FROM payments WHERE reference=$1', [r.body.payment.reference])).rows[0];
    ok(!JSON.stringify(row).includes('4242424242424242') && !('cvv' in row) && !('cardNumber' in row), 'el pago guarda datos de tarjeta completos');
    is(await req('GET', `/lessons/${paid.lessons[0].id}`, { token: s1.token }), 200);
  });
  await t('Pagar otra vez estando inscrito → 409', async () => { is(await pay(s1, card('4242 4242 4242 4242')), 409); });
  await t('Mis comprobantes: el rechazado y el aprobado, el más reciente primero', async () => {
    const list = is(await req('GET', '/payments/mine', { token: s1.token }), 200).body;
    ok(list.length >= 2 && list[0].status === 'APPROVED' && list.some((p) => p.status === 'DECLINED'));
    ok(!JSON.stringify(list).includes('cvv'));
    eq(is(await req('GET', '/payments/mine', { token: s3.token }), 200).body.length, 0, 've comprobantes ajenos');
  });
  await t('Cancelar y reinscribirse NO cobra de nuevo (alreadyPaid)', async () => {
    is(await req('DELETE', `/courses/${paid.id}/enroll`, { token: s1.token }), 200);
    const r = is(await pay(s1, card('5555 5555 5555 4444')), 200, 201).body;
    eq(r.alreadyPaid, true);
    eq(r.enrolled, true);
  });
  await t('Mastercard y otra tarjeta válida se aprueban', async () => { eq(is(await pay(s2, card('5555 5555 5555 4444')), 200, 201).body.status, 'APPROVED'); });
  await t('Pagar un curso gratis → 400; un docente o sin sesión no paga (403/401)', async () => {
    const free = await buildCourse(t1, { title: `Gratis ${ctx.run}`, lessons: 1 });
    is(await pay(s3, card('4242 4242 4242 4242'), free.id), 400);
    is(await pay(t1, card('4242 4242 4242 4242')), 403);
    is(await req('POST', `/courses/${paid.id}/checkout`, { body: card('4242 4242 4242 4242') }), 401);
  });
  await t('Pagar un curso inexistente o en borrador → 404', async () => {
    is(await pay(s3, card('4242 4242 4242 4242'), 99999999), 404);
    const draft = await buildCourse(t1, { title: `Borr pago ${ctx.run}`, patch: { price: 10000 }, publish: false });
    is(await pay(s3, card('4242 4242 4242 4242'), draft.id), 404);
  });
}
