import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';

async function soyAdmin(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const rol = (data as { role: string | null } | null)?.role;
  return rol === 'admin' || rol === 'direccion';
}

export async function POST(req: NextRequest) {
  if (!(await soyAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  if (!hayServiceRole()) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    nombre?: string;
    rol?: string;
    comercialId?: string | null;
  };

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const rol = String(body.rol ?? 'comercial');
  if (!email.includes('@') || password.length < 8) {
    return NextResponse.json({ error: 'Email válido y contraseña de al menos 8 caracteres.' }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: String(body.nombre ?? '') || email },
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el usuario.' }, { status: 400 });
  }

  const { error: e2 } = await admin
    .from('profiles')
    .upsert({
      id: data.user.id,
      role: rol,
      comercial_id: body.comercialId || null,
      full_name: String(body.nombre ?? '') || email,
    });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: data.user.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await soyAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  if (!hayServiceRole()) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    rol?: string;
    comercialId?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: 'Falta el usuario.' }, { status: 400 });

  const admin = createServiceClient();
  const { error } = await admin
    .from('profiles')
    .update({ role: body.rol ?? null, comercial_id: body.comercialId || null })
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
