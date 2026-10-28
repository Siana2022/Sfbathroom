/**
 * Constantes y tipos del módulo comercial, sin dependencias de servidor.
 *
 * Viven aparte de `lib/datos/comercial.ts` porque ese importa `next/headers`
 * (cliente Supabase con cookies) y no puede entrar en un componente cliente.
 */

export type TipoInteraccion = 'llamada' | 'email' | 'reunion' | 'visita' | 'nota';

export const TIPOS_INTERACCION: { valor: TipoInteraccion; etiqueta: string }[] = [
  { valor: 'llamada', etiqueta: 'Llamada' },
  { valor: 'email', etiqueta: 'Email' },
  { valor: 'reunion', etiqueta: 'Reunión' },
  { valor: 'visita', etiqueta: 'Visita' },
  { valor: 'nota', etiqueta: 'Nota' },
];

export const RESULTADOS_INTERACCION = [
  { valor: 'positivo', etiqueta: 'Positivo' },
  { valor: 'neutro', etiqueta: 'Neutro' },
  { valor: 'negativo', etiqueta: 'Negativo' },
  { valor: 'sin_respuesta', etiqueta: 'Sin respuesta' },
];

export const ETIQUETA_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS_INTERACCION.map((t) => [t.valor, t.etiqueta]),
);

export type Contacto = {
  id: string;
  cliente_id: string;
  nombre: string;
  apellidos: string | null;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  movil: string | null;
  pais: string | null;
  provincia: string | null;
  idioma: string | null;
  activo: boolean;
  notas: string | null;
};

export type Interaccion = {
  id: string;
  cliente_id: string;
  contacto_id: string | null;
  comercial_id: string | null;
  usuario_id: string | null;
  tipo: TipoInteraccion;
  fecha: string;
  asunto: string | null;
  contenido: string;
  resultado: string | null;
  duracion_min: number | null;
  resumen_ia: string | null;
  conclusiones_ia: string | null;
  resumen_generado_at: string | null;
};
