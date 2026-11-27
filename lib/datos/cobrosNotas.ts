import { createClient } from '@/lib/supabase/server';
import { getUsuario } from '@/lib/datos/role';

export type NotaCobro = {
  id: string;
  fecha: string | null;
  documento: string | null;
  importe: number | null;
  texto: string;
};

/** Perfiles que pueden ver notas de cobro. El comercial queda fuera. */
const ROLES = new Set(['admin', 'direccion', 'financiero', 'administracion']);

/**
 * Notas de cobro de un cliente (importadas de A3ERP). Devuelve vacío si el perfil no
 * tiene acceso; la RLS de `cobros_notas` lo impide igualmente a nivel de base.
 */
export async function getNotasCobroCliente(clienteId: string): Promise<NotaCobro[]> {
  const usuario = await getUsuario();
  if (!usuario || !ROLES.has(usuario.rol ?? '')) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from('cobros_notas')
    .select('id, fecha, documento, importe, texto')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false });

  return ((data ?? []) as {
    id: string;
    fecha: string | null;
    documento: string | null;
    importe: number | null;
    texto: string;
  }[]).map((n) => ({
    id: n.id,
    fecha: n.fecha,
    documento: n.documento,
    importe: n.importe === null ? null : Number(n.importe),
    texto: n.texto,
  }));
}
