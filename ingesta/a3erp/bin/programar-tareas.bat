@echo off
REM ============================================================
REM  Crea (o reemplaza) las tareas programadas de la ingesta.
REM  Ejecutar como ADMINISTRADOR (boton derecho > Ejecutar como admin).
REM
REM   - Ingesta DIARIA   : lunes a sabado a las 22:00
REM   - Reconciliacion   : domingos a las 22:00 (red de seguridad)
REM ============================================================
setlocal
set "DIR=%~dp0"

set "TAREA_DIARIA=sfbathroom-Ingesta-Diaria"
set "TAREA_SEMANAL=sfbathroom-Ingesta-Semanal"

echo Creando tarea DIARIA (%TAREA_DIARIA%) -> lunes a sabado 22:00 ...
schtasks /Create /TN "%TAREA_DIARIA%" /TR "\"%DIR%ingesta-diaria.bat\"" /SC WEEKLY /D MON,TUE,WED,THU,FRI,SAT /ST 22:00 /F

echo Creando tarea SEMANAL (%TAREA_SEMANAL%) -> domingos 22:00 ...
schtasks /Create /TN "%TAREA_SEMANAL%" /TR "\"%DIR%ingesta-semanal.bat\"" /SC WEEKLY /D SUN /ST 22:00 /F

echo.
echo Tareas registradas. Comprobacion:
schtasks /Query /TN "%TAREA_DIARIA%"
schtasks /Query /TN "%TAREA_SEMANAL%"

echo.
echo Para lanzar una prueba AHORA mismo (sin esperar a la hora):
echo    schtasks /Run /TN "%TAREA_DIARIA%"
echo Para borrarlas:
echo    schtasks /Delete /TN "%TAREA_DIARIA%" /F
echo    schtasks /Delete /TN "%TAREA_SEMANAL%" /F
endlocal
pause
