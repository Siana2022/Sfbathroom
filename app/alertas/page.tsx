import { cookies } from 'next/headers';
import { getAlertas } from '@/lib/datos/alertas';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import GestionAlerta from '@/components/GestionAlerta';


const ANIO = 2026;

const SEVERIDAD: Record<string, string> = {
  ok: 'badge listo',
  aviso: 'badge pendiente',
  critico: 'badge construccion',
};

async function getPerfiles() {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data } = await supabase.from('profiles').select('id, full_name, role');
  return (data ?? []) as { id: string; full_name: string | null; role: string | null }[];
}

export default async function AlertasPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getAlertas(empresa, ANIO);
  const criticas = d.senales.filter((s) => s.severidad === 'critico').length;
  const perfiles = await getPerfiles();

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 11</p>
      <h1>Alertas</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Avisos por umbral sobre los datos de {d.empresa.nombre}: fuga y clientes no activos, rotura
        de stock, vencidos, DSO al alza, saturación comercial, retraso de proveedor, dependencia de
        cliente y erosión de precio. Los umbrales se editan en Configuración.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Señales críticas" valor={numero(criticas)} nota={`de ${d.senales.length} señales evaluadas`} />
        <Kpi etiqueta="Reglas configuradas" valor={numero(d.config.length)} nota="activas" />
      </ul>

      <div className="card">
        <h2>Señales</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Señal</th>
              <th className="td-num">Valor</th>
              <th>Severidad</th>
            </tr>
          </thead>
          <tbody>
            {d.senales.map((s) => (
              <tr key={s.etiqueta}>
                <td>{s.etiqueta}</td>
                <td className="td-num">{s.valor}</td>
                <td>
                  <span className={SEVERIDAD[s.severidad]}>
                    {s.severidad === 'ok' ? 'OK' : s.severidad === 'aviso' ? 'Aviso' : 'Crítico'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="alertas-senales"
            columnas={['Señal', 'Valor', 'Severidad']}
            registros={d.senales.map((s) => [s.etiqueta, s.valor, s.severidad])}
          />
        </div>
      </div>

      <div className="card">
        <h2>Alertas generadas</h2>
        {d.generadas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aún no se han registrado alertas automáticas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th className="td-num">Importe</th>
                <th>Mensaje</th>
                <th>Severidad</th>
                <th>Gestión</th>
              </tr>
            </thead>
            <tbody>
              {d.generadas.map((g) => (
                <tr key={g.id} className={g.estado === 'descartada' ? 'fila-apagada' : undefined}>
                  <td>{g.fecha.slice(0, 10)}</td>
                  <td>{g.referencia ?? '—'}</td>
                  <td className="td-num">{g.importe === null ? '—' : eur(g.importe)}</td>
                  <td>{g.mensaje ?? '—'}</td>
                  <td>
                    {g.severidad === 'critico' ? (
                      <span className="badge construccion">Crítico</span>
                    ) : g.severidad === 'aviso' ? (
                      <span className="badge pendiente">Aviso</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <GestionAlerta
                      alertaId={g.id}
                      estadoActual={g.estado}
                      asignadaActual={g.asignada_a}
                      perfiles={perfiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}