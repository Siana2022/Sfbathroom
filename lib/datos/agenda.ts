import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { getUsuario } from '@/lib/datos/role';

export type EventoAgenda = {
  id: string;
  fecha: string;
  hora: string | null;
  titulo: string;
  notas: string | null;
  completada: boolean;
  clienteId: string | null;
  clienteNombre: string | null;
};

export type AgendaData = {
  empresaId: string;
  comercialId: string | null;
  esComercial: boolean;
  eventos: EventoAgenda[];
  clientes: { id: string; nombre: string }[];
};

export async function getAgenda(codigoEmpresa: string): Promise<AgendaData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const usuario = await getUsuario();

  let comercialId: string | null = null;
  let esComercial = false;
  if (usuario) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role, comercial_id')
      .eq('id', usuario.id)
      .maybeSingle();
    esComercial = perfil?.role === 'comercial';
    comercialId = (perfil?.comercial_id as string | null) ?? null;
  }

  const { data: eventosRaw } = await supabase
    .from('agenda')
    .select('id, comercial_id, cliente_id, fecha, hora, titulo, notas, completada')
    .eq('empresa_id', empresa.id)
    .order('fecha', { ascending: true });

  const clientes = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
    supabase
      .from('clientes')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .order('nombre')
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  const eventos: EventoAgenda[] = ((eventosRaw ?? []) as {
    id: string;
    cliente_id: string | null;
    fecha: string;
    hora: string | null;
    titulo: string;
    notas: string | null;
    completada: boolean;
  }[]).map((e) => ({
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    titulo: e.titulo,
    notas: e.notas,
    completada: e.completada,
    clienteId: e.cliente_id,
    clienteNombre: e.cliente_id ? (nombreCliente.get(e.cliente_id) ?? '—') : null,
  }));

  return {
    empresaId: empresa.id,
    comercialId: esComercial ? comercialId : null,
    esComercial,
    eventos,
    clientes: clientes.map((c) => ({ id: c.id, nombre: c.nombre })),
  };
}
