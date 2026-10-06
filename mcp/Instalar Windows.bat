@echo off
chcp 65001 >nul
REM Sfbathroom MCP · Instalador Windows (doble clic) · Node portátil incluido
title Sfbathroom MCP - Instalador
cd /d "%~dp0"

echo INICIO %date% %time% > instalador.log

set "NODE=%~dp0node\win\node.exe"

if not exist "mcp\dist\index.js" (
  echo ERROR: no existe mcp\dist\index.js.
  echo Ejecuta esto CON la carpeta EXTRAIDA del .zip:
  echo clic derecho sobre el .zip y "Extraer todo...".  >> instalador.log
  type instalador.log
  pause
  exit /b 1
)

if not exist "%NODE%" (
  echo ERROR: no encuentro el Node portatil del paquete (node\win\node.exe). >> instalador.log
  type instalador.log
  pause
  exit /b 1
)

echo Usando Node portatil: %NODE% >> instalador.log
"%NODE%" install-desktop.mjs >> instalador.log 2>&1
echo FIN %date% %time% >> instalador.log
type instalador.log

echo.
echo  ============================================================
echo    ¡LISTO! Cierra Claude del todo y abre. En Settings deberia
echo    aparecer la extension o herramientas de sfbathroom-bi.
echo    (El resumen queda en "instalador.log")
echo  ============================================================
pause