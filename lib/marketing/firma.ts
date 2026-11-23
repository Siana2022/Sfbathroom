import { createHmac } from 'node:crypto';

const secreto = () =>
  process.env.MARKETING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'sfbathroom-marketing';

export function firmaBaja(email: string): string {
  return createHmac('sha256', secreto()).update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function enlaceBaja(email: string, base: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase());
  return `${base.replace(/\/$/, '')}/api/marketing/baja?e=${e}&t=${firmaBaja(email)}`;
}
