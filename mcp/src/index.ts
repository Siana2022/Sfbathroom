import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import './entorno.js';
import { herramientas } from './herramientas.js';
import { DatosError } from './consulta.js';

const server = new McpServer({
  name: 'sfbathroom-bi',
  version: '1.0.0',
});

for (const [nombre, herramienta] of Object.entries(herramientas)) {
  server.registerTool(
    nombre,
    {
      title: nombre,
      description: herramienta.descripcion,
      inputSchema: herramienta.schema,
    },
    async (args: any) => {
      try {
        const entrada = args as Parameters<typeof herramienta.ejecutar>[0];
        return await herramienta.ejecutar(entrada as never);
      } catch (e) {
        const mensaje = e instanceof DatosError ? e.message : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text' as const, text: `Error: ${mensaje}` }], isError: true };
      }
    },
  );
}

// Permite invocar herramientas por función sencilla (pruebas rápidas).

await server.connect(new StdioServerTransport());