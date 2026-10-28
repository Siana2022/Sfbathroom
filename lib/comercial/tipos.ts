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

export type EstadoReunion = 'programada' | 'realizada' | 'cancelada';

export const ESTADOS_REUNION: { valor: EstadoReunion; etiqueta: string }[] = [
  { valor: 'programada', etiqueta: 'Programada' },
  { valor: 'realizada', etiqueta: 'Realizada' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
];

export type ModalidadReunion = 'presencial' | 'telefono' | 'videollamada' | 'email' | 'otros';

export const MODALIDADES_REUNION: { valor: ModalidadReunion; etiqueta: string }[] = [
  { valor: 'videollamada', etiqueta: 'Videollamada' },
  { valor: 'telefono', etiqueta: 'Llamada telefónica' },
  { valor: 'email', etiqueta: 'Email' },
  { valor: 'presencial', etiqueta: 'Presencial' },
  { valor: 'otros', etiqueta: 'Otros' },
];

/**
 * Estados del cliente en el CRM. Deliberadamente separados de
 * `clientes.estado` (activo/inactivo/perdido), que lo calcula el ERP y
 * alimenta el semáforo de fuga: son dos cosas distintas y mezclarlas
 * rompería esos avisos.
 */
export type EstadoCrm = 'habitual' | 'nuevo' | 'seguimiento' | 'ganado' | 'perdido';

export const ESTADOS_CRM: { valor: EstadoCrm; etiqueta: string }[] = [
  { valor: 'habitual', etiqueta: 'Cliente habitual' },
  { valor: 'nuevo', etiqueta: 'Nuevo cliente' },
  { valor: 'seguimiento', etiqueta: 'En seguimiento' },
  { valor: 'ganado', etiqueta: 'Cliente ganado' },
  { valor: 'perdido', etiqueta: 'Cliente perdido' },
];

export const ETIQUETA_ESTADO_CRM: Record<string, string> = Object.fromEntries(
  ESTADOS_CRM.map((e) => [e.valor, e.etiqueta]),
);

export type Hito = {
  id: string;
  cliente_id: string;
  comercial_id: string | null;
  usuario_id: string | null;
  fecha: string;
  titulo: string;
  detalle: string | null;
  created_at: string;
};

export type HitoConAutor = Hito & { autor: string | null };

export const ETIQUETA_ESTADO_REUNION: Record<string, string> = Object.fromEntries(
  ESTADOS_REUNION.map((e) => [e.valor, e.etiqueta]),
);

export const ETIQUETA_MODALIDAD: Record<string, string> = Object.fromEntries(
  MODALIDADES_REUNION.map((m) => [m.valor, m.etiqueta]),
);

export type Reunion = {
  id: string;
  cliente_id: string;
  contacto_id: string | null;
  comercial_id: string | null;
  usuario_id: string | null;
  fecha_hora: string;
  duracion_min: number | null;
  asunto: string | null;
  modalidad: ModalidadReunion | null;
  /** Texto libre cuando `modalidad` es 'otros'. */
  modalidad_otro: string | null;
  estado: EstadoReunion;
  notas: string | null;
  interaccion_id: string | null;
  created_at: string;
};

export type ReunionConContexto = Reunion & {
  cliente: string;
  contacto: string | null;
  comercial: string | null;
};
