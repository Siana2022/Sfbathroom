import { createClient } from '@/lib/supabase/server';

export type ContactoCliente = {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  esPrincipal: boolean;
};

export async function getContactosCliente(clienteId: string): Promise<ContactoCliente[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('clientes_contactos')
    .select('id, nombre, cargo, telefono, email, es_principal')
    .eq('cliente_id', clienteId)
    .order('es_principal', { ascending: false })
    .order('nombre');
  return ((data ?? []) as { id: string; nombre: string; cargo: string | null; telefono: string | null; email: string | null; es_principal: boolean }[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    cargo: c.cargo,
    telefono: c.telefono,
    email: c.email,
    esPrincipal: c.es_principal,
  }));
}
