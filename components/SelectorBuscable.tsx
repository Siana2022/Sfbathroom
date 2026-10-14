'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

export type OpcionBuscable = { id: string; nombre: string };

type Props = {
  opciones: OpcionBuscable[];
  valor: string;
  onChange: (id: string | undefined) => void;
  etiqueta: string;
  textoTodos?: string;
  placeholder?: string;
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const MAX_VISIBLES = 50;

export default function SelectorBuscable({
  opciones,
  valor,
  onChange,
  etiqueta,
  textoTodos = 'Todos',
  placeholder = 'Buscar…',
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const seleccionado = opciones.find((o) => o.id === valor);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const base = q ? opciones.filter((o) => normalizar(o.nombre).includes(q)) : opciones;
    return base.slice(0, MAX_VISIBLES);
  }, [opciones, busqueda]);

  const lista = useMemo(
    () => [{ id: '', nombre: textoTodos }, ...filtradas],
    [filtradas, textoTodos],
  );

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda('');
      }
    }
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, []);

  useEffect(() => {
    setResaltado(0);
  }, [busqueda]);

  function elegir(id: string | undefined) {
    onChange(id);
    setAbierto(false);
    setBusqueda('');
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setAbierto(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado((r) => Math.min(r + 1, lista.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = lista[resaltado];
      elegir(op ? op.id || undefined : undefined);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setBusqueda('');
    }
  }

  return (
    <div className="campo-filtro selector-buscable" ref={contenedorRef}>
      <span>{etiqueta}</span>
      <div className="selector-envoltura">
        <input
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          autoComplete="off"
          value={abierto ? busqueda : seleccionado?.nombre ?? ''}
          placeholder={seleccionado ? '' : placeholder}
          onChange={(e) => {
            setBusqueda(e.target.value);
            if (!abierto) setAbierto(true);
          }}
          onFocus={() => {
            setAbierto(true);
            setBusqueda('');
            setResaltado(0);
          }}
          onKeyDown={alTeclado}
        />
        {seleccionado && (
          <button
            type="button"
            className="selector-limpiar"
            aria-label="Quitar filtro"
            onMouseDown={(e) => {
              e.preventDefault();
              elegir(undefined);
            }}
          >
            ×
          </button>
        )}
        {abierto && (
          <ul className="selector-lista" role="listbox">
            {lista.map((o, i) => (
              <li
                key={o.id || '__todos'}
                role="option"
                aria-selected={valor === o.id || (!valor && !o.id)}
                className={`selector-opcion${i === resaltado ? ' resaltado' : ''}`}
                onMouseEnter={() => setResaltado(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o.id || undefined);
                }}
              >
                {o.nombre}
              </li>
            ))}
            {filtradas.length === 0 && busqueda.trim() !== '' && (
              <li className="selector-vacio">Sin resultados</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
