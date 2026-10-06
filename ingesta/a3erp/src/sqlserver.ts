import mssql from 'mssql';
import { cfg } from './config.js';

export async function leerCuboVentas(sql: string, baseDatos: string): Promise<Record<string, unknown>[]> {
  const pool = await mssql.connect({ ...cfg.mssql, database: baseDatos });
  try {
    const res = await pool.request().query(sql);
    return res.recordset as Record<string, unknown>[];
  } finally {
    await pool.close();
  }
}