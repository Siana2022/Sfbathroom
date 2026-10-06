# Despliegue del MCP remoto en Vercel (proyecto aparte)

- `api/index.ts` — fuente de la función (importa el núcleo de `../../mcp/src/http-mcp.ts`).
- `api.js` — bundle autocontenido (esbuild, CJS, sin dependencias en runtime). Es el que se sube.
- `vercel.json` — build `@vercel/node` + ruta `/.*` → `api.js`.

## Pasos (una vez autenticado el CLI con tu cuenta)

```bash
cd deploy/mcp-api
vercel link --project sfbathroom-mcp        # registra el proyecto
vercel env add MCP_TOKEN production < token-fuerte.txt
vercel env add SUPABASE_SERVICE_ROLE_KEY production < key.txt
vercel --prod
```

En Vercel (dashboard también vale): añadir las env `MCP_TOKEN` y `SUPABASE_SERVICE_ROLE_KEY`
al proyecto `sfbathroom-mcp`.

## Prueba post-deploy
```bash
curl -H "Authorization: Bearer $MCP_TOKEN" https://sfbathroom-mcp.vercel.app/
curl -X POST -H "Authorization: Bearer $MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' https://sfbathroom-mcp.vercel.app/
```

## Conector en Claude (cualquier equipo)
Añadir servidor MCP por URL: nombre `SF BI`, URL producción, autenticación
"Sin inicio de sesión", header `Authorization: Bearer <MCP_TOKEN>`.