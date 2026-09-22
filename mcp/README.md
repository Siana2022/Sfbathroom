# Sfbathroom BI · MCP server

Conexión entre Claude (Claude Code / Claude Desktop) y los datos de sfbathroom BI
(Supabase). Es de **solo lectura**: no crea ni modifica datos.

## Configuración rápida

1. Instala dependencias:

   ```bash
   cd mcp && npm install
   ```

2. Crea el fichero de secretos (NO se versiona):

   ```bash
   cp mcp/.env.example mcp/.env
   ```

   y rellena `mcp/.env` con la URL de Supabase y la **service role key**
   (Vercel → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY`).

   ⚠️ La service role key salta RLS y es **totalmente administrativa**.
   Esta herramienta es de solo lectura y para tu máquina; no la compartas ni
   la pongas en un cliente.

## Uso con Claude Code (recomendado)

Ya hay un `.mcp.json` en la raíz del repo; Claude Code lo detecta al abrir el
proyecto y conecta el servidor automáticamente. Si el entorno no expone el
secret (edición desde otro equipo), dale el `.env` y arranca manualmente:

```bash
npx @modelcontextprotocol/inspector node mcp/dist/index.js
```

## Uso con Claude Desktop

Añade este bloque en Claude → Settings → Developer → Edit Config
(claude_desktop_config.json):

```json
{
  "mcpServers": {
    "sfbathroom": {
      "command": "node",
      "args": ["<RUTA_ABSOLUTA>/Sfbathroom/mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://dgbxualxhrbbqglvxtxq.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service_role_key>"
      }
    }
  }
}
```

(Puedes omitir `env` y dejar que el servidor lea `mcp/.env`.)

## Herramientas disponibles

| Herramienta | Descripción |
|---|---|
| `listar_empresas` | Código y nombre de las empresas del sistema. |
| `ventas_por_mes` | Neta, unidades, documentos y abonos/notas por mes de un ejercicio. |
| `evolucion_anual` | Neta acumulada a un mes frente al mismo periodo del año anterior. |
| `top_clientes` | Clientes ordenados por neta con peso porcentual. |
| `desglose_variacion` | Variación entre ejercicios en precio, volumen, mix y efecto clientes. |
| `margen_resumen` | Importe vendido, coste, margen y top de familias del ejercicio. |
| `stock_resumen` | Unidades totales, nº de referencias y top de artículos por valor. |
| `clientes_impagados` | Saldo en cartera / vencido / total por cliente (vista de saldos). |

## Desarrollo

```bash
cd mcp
npm run build     # compila a dist/
npm run dev       # arranca el servidor en modo desarrollo (stdio)
```

Recuerda tras cada cambio: `npx tsc --noEmit` (dentro de `mcp/`) y el
`CI=true npm run build` del repo si tocas algo de la app.