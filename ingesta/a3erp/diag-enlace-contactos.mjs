/**
 * Diagnóstico (solo lectura): ¿dónde se enlaza cada contacto con su cliente?
 *
 * `ContactosSeleccionClientes` no tiene CODCLI, así que hay que encontrar la tabla
 * puente. Este script lista todas las tablas cuyo nombre contiene CONTACTO, con sus
 * columnas, y marca las que tienen a la vez algo tipo CODCLI e IDCONTACTO.
 *
 * Uso: node --env-file=.env diag-enlace-contactos.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const e = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'].map((k) => [k, process.env[k] ?? '']),
);

const pool = await mssql.connect({
  server: e.MSSQL_HOST,
  port: Number(e.MSSQL_PORT || '1433'),
  user: e.MSSQL_USER,
  password: e.MSSQL_PASSWORD,
  options: { encrypt: e.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

try {
  // Con una empresa basta para ver el esquema; SF es la de referencia.
  const emp = a3.empresas.find((x) => x.codigo === 'SF') ?? a3.empresas[0];
  const base = `[${emp.base}]`;

  const tablas = (
    await pool
      .request()
      .query(`SELECT TABLE_NAME AS t FROM ${base}.INFORMATION_SCHEMA.TABLES
              WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE '%CONTACTO%'
              ORDER BY TABLE_NAME`)
  ).recordset.map((r) => r.t);

  console.log(`Tablas con CONTACTO en ${emp.codigo}: ${tablas.join(', ') || 'ninguna'}`);

  for (const t of tablas) {
    const cols = (
      await pool
        .request()
        .query(`SELECT COLUMN_NAME AS c FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${t}' ORDER BY ORDINAL_POSITION`)
    ).recordset.map((r) => r.c);

    const tieneCliente = cols.some((c) => /^CODCLI$|^COD_CLIENTE$|^CLIENTE$/i.test(c));
    const tieneContacto = cols.some((c) => /^IDCONTACTO$|^CONTACTO$/i.test(c));
    const n = (await pool.request().query(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${t}]`)).recordset[0]?.n;

    console.log(`\n--- ${t} (${n} filas)${tieneCliente && tieneContacto ? '  ← ENLACE PROBABLE' : ''}`);
    console.log(cols.join(', '));
  }
} finally {
  await pool.close();
}

console.log('\nListo. Solo lectura.');
