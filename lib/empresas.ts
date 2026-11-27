/** Empresas del grupo. Origen único para cabecera, filtros y vistas fusionadas. */
export const EMPRESAS = [
  { codigo: 'SF', nombre: 'SF Bathroom' },
  { codigo: 'DOT', nombre: 'DOT Surfaces' },
  { codigo: 'FUX', nombre: 'Fuxsabany' },
] as const;

export type CodigoEmpresa = (typeof EMPRESAS)[number]['codigo'];
