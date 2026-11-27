import { createClient } from '@/lib/supabase/server';

export type InteraccionPendiente = {
  id: string;
  fecha: string;
  tipo: string;
  titulo: string | null;
  detalle: string | null;
  resultado: string | null;
  origen: string | null;
  idExterno: string | null;
};

/**
 * Interacciones importadas que no se pudieron cruzar con un cliente
 * (`pendiente = true`). Se listan para vincularlas a mano.
 */
export async function getInteraccionesPendientes(limite = 200): Promise<InteraccionPendiente[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('interacciones')
    .select('id, fecha, tipo, titulo, detalle, resultado, origen, id_externo')
    .eq('pendiente', true)
    .order('fecha', { ascending: false })
    .limit(limite);

  return ((data ?? []) as {
    id: string;
    fecha: string;
    tipo: string;
    titulo: string | null;
    detalle: string | null;
    resultado: string | null;
    origen: string | null;
    id_externo: string | null;
  }[]).map((i) => ({
    id: i.id,
    fecha: i.fecha,
    tipo: i.tipo,
    titulo: i.titulo,
    detalle: i.detalle,
    resultado: i.resultado,
    origen: i.origen,
    idExterno: i.id_externo,
  }));
}

/** Nº de interacciones pendientes, para el aviso del menú. */
export async function contarInteraccionesPendientes(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('interacciones')
    .select('id', { count: 'exact', head: true })
    .eq('pendiente', true);
  return count ?? 0;
}
