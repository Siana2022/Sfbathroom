#!/usr/bin/env node
/**
 * Instalador del MCP sfbathroom-bi en Claude Desktop de esta máquina.
 *
 * Uso (desde mcp/):
 *   node install-desktop.mjs
 *
 * Hace todo solo:
 *  1. Instala dependencias (si faltan) y compila dist/
 *  2. Crea mcp/.env con la service role key (te la pide si no existe)
 *  3. Añade la entrada sfbathroom-bi a claude_desktop_config.json
 *     (con rutas absolutas, válidas en macOS, Windows y Linux)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const mcpDir = path.dirname(fileURLToPath(import.meta.url));
const indexFile = path.join(mcpDir, 'dist', 'index.js');
const nodeExec = process.execPath;

function configPath() {
  const base = process.platform === 'darwin'
    ? path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Claude')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA ?? '', 'Claude')
      : path.join(process.env.HOME ?? '', '.config', 'Claude');
  return path.join(base, 'claude_desktop_config.json');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function asegurarEnv() {
  const envFile = path.join(mcpDir, '.env');
  if (fs.existsSync(envFile)) {
    const raw = fs.readFileSync(envFile, 'utf8');
    if (raw.includes('SUPABASE_SERVICE_ROLE_KEY=') && !raw.includes('pon_aqui')) {
      console.log('[1/3] mcp/.env ya existe con la service role key.');
      return;
    }
  }
  console.log('Necesito la SUPABASE_SERVICE_ROLE_KEY para mcp/.env.');
  console.log('(Supabase → Settings → API Keys → service_role, la que empieza por eyJ...)');
  const key = await ask('Pégala aquí: ');
  if (!key) { console.error('Abortado: no se indicó clave.'); process.exit(1); }
  fs.writeFileSync(envFile, `SUPABASE_URL=https://dgbxualxhrbbqglvxtxq.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=${key}\n`);
  console.log('[1/3] mcp/.env creado.');
}

function build() {
  if (fs.existsSync(indexFile)) {
    console.log('[2/3] Servidor ya compilado (dist/index.js).');
    return;
  }
  console.log('Compilando el servidor...');
  if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) {
    console.log('  instalando dependencias (puede tardar)...');
    execSync('npm install', { cwd: mcpDir, stdio: 'inherit' });
  }
  execSync('npm run build', { cwd: mcpDir, stdio: 'inherit' });
  if (!fs.existsSync(indexFile)) { console.error('Error: no se generó dist/index.js.'); process.exit(1); }
  console.log('[2/3] Servidor compilado.');
}

function registrarEnClaude() {
  const cfgFile = configPath();
  fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
  const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
  cfg.mcpServers = cfg.mcpServers ?? {};

  const env = {};
  for (const line of fs.readFileSync(path.join(mcpDir, '.env'), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  const ya = Boolean(cfg.mcpServers['sfbathroom-bi']);
  cfg.mcpServers['sfbathroom-bi'] = {
    command: nodeExec,
    args: [indexFile],
    env,
  };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[3/3] Claude Desktop ${ya ? 'actualizado' : 'configurado'}:`);
  console.log(`   archivo: ${cfgFile}`);
  console.log('\nReinicia Claude Desktop (Cmd+Q / Ctrl+Q) y prueba:');
  console.log('  "Lista las empresas del sistema"');
}

await asegurarEnv();
build();
registrarEnClaude();