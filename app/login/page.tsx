import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginForm from './login-form';

export const metadata = { title: 'Acceso · sfbathroom BI' };

export default async function LoginPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/');

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>sfbathroom · BI</h1>
        <p className="login-sub">Acceso al cuadro de mando</p>
        <LoginForm />
      </div>
    </div>
  );
}