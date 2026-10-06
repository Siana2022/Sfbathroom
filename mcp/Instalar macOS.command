#!/bin/bash
# Sfbathroom MCP · Instalador macOS (doble clic) · Node portátil incluido
cd "$(dirname "$0")"

# Quita el "desarrollador no verificado" si el paquete llegó como descarga
xattr -dr com.apple.quarantine "$(pwd)" 2>/dev/null || true

NODE="$PWD/node/mac/bin/node"

echo "============================================================="
echo "  INSTALADOR Sfbathroom MCP"
echo "============================================================="
echo ""

if [ ! -f "$NODE" ]; then
  echo "  No encuentro el Node del paquete (node/mac/bin/node)."
  echo "  ¿Has descomprimido el ZIP completo?"
  echo "  Doble clic al .zip y se extrae solo. Después abre la"
  echo "  carpeta Sfbathroom-MCP y repite el doble clic aquí."
  read -r -p "  Pulsa Enter para cerrar esta ventana..."
  exit 1
fi

if [ ! -f "mcp/dist/index.js" ]; then
  echo "  Falta mcp/dist/index.js. Asegúrate de haber extraído el ZIP entero."
  read -r -p "  Pulsa Enter para cerrar esta ventana..."
  exit 1
fi

cd mcp
"$NODE" install-desktop.mjs

echo ""
echo "============================================================="
echo "  ¡LISTO! Cierra Claude por completo (Cmd+Q) y ábrelo."
echo "  En Settings → Extensions... deberías ver sfbathroom-bi."
echo "============================================================="
read -r -p "Pulsa Enter para cerrar esta ventana..."