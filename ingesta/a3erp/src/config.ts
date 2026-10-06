import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function entorno(nombre: string, defecto?: string): string {
  const v = process.env[nombre] ?? defecto;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export const cfg = {
  mssql: {
    server: entorno('MSSQL_HOST'),
    port: Number(entorno('MSSQL_PORT', '1433')),
    database: entorno('MSSQL_DATABASE', ''),
    user: entorno('MSSQL_USER'),
    password: entorno('MSSQL_PASSWORD'),
    options: { encrypt: entorno('MSSQL_ENCRYPT', 'true') === 'true', trustServerCertificate: true },
  },
  supabaseUrl: entorno('SUPABASE_URL').replace(/\/$/, ''),
  serviceRoleKey: entorno('SUPABASE_SERVICE_ROLE_KEY'),
  empresaCodigo: entorno('EMPRESA_CODIGO', 'SF'),
  ventanaDias: Number(entorno('VENTANA_DIAS', '45')),
  periodoStart: entorno('PERIODO_START', '2022-01-01'),
  loteSize: Number(entorno('LOTE_SIZE', '500')),
};

export type A3Config = {
  sqlVentas: { consulta: string; filtroFecha: string };
  tiposDocumento: Record<string, string>;
  columnas: Record<string, string>;
  empresas: { codigo: string; base: string }[];
};

export const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8')) as A3Config;

export function empresaInfo(codigo: string): { codigo: string; base: string } {
  const e = a3.empresas.find((x) => x.codigo === codigo);
  if (!e) throw new Error(`empresa no registrada en a3erp.config.json: ${codigo}`);
  return e;
}

export type Argumentos = {
  modo: string;
  empresa?: string;
  desde?: string;
  hasta?: string;
};

export function leerArgumentos(argv: string[]): Argumentos {
  const args: Argumentos = { modo: 'diario' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--modo') args.modo = argv[++i];
    else if (argv[i] === '--empresa') args.empresa = argv[++i];
    else if (argv[i] === '--desde') args.desde = argv[++i];
    else if (argv[i] === '--hasta') args.hasta = argv[++i];
  }
  return args;
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function menosDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}