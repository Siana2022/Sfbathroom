'use client';

import { useEffect, useState } from 'react';

function urlsAVectores(base64: string): Uint8Array {
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushSuscripcion() {
  const [estado, setEstado] = useState<'no' | 'preparando' | 'activo' | 'denegado' | 'error'>('no');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [vapid] = useState(() => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado('error');
      setMensaje('Este navegador no soporta notificaciones push.');
    }
  }, []);

  async function activar() {
    if (!vapid) {
      setEstado('error');
      setMensaje('Faltan las claves VAPID del servidor.');
      return;
    }
    setEstado('preparando');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado('denegado');
        setMensaje('Permiso de notificaciones no concedido.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlsAVectores(vapid) as unknown as ArrayBuffer,
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error('No se pudo guardar la suscripción');
      setEstado('activo');
      setMensaje('Avisos push activados.');
    } catch (err) {
      setEstado('error');
      setMensaje(err instanceof Error ? err.message : 'Error al activar push.');
    }
  }

  async function desactivar() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
      await sub.unsubscribe();
    }
    setEstado('no');
    setMensaje('Avisos push desactivados.');
  }

  if (estado === 'activo') {
    return (
      <button type="button" className="btn secundario" onClick={desactivar}>
        Avisos push: activados
      </button>
    );
  }
  return (
    <div>
      <button type="button" className="btn" onClick={activar} disabled={estado === 'preparando' || !vapid}>
        {estado === 'preparando' ? 'Activando…' : 'Activar avisos en este dispositivo'}
      </button>
      {mensaje && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>{mensaje}</p>}
    </div>
  );
}