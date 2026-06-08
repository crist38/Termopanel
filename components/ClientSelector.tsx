'use client'

import React, { useState, useEffect, useRef } from 'react';
import { buscarClientesOdoo, crearClienteOdoo } from '@/app/actions/odoo';
import { Search, UserPlus, Check, X, Loader2 } from 'lucide-react';
import { OdooCustomer } from '@/lib/odoo-customers';

interface ClientSelectorProps {
  value: string;
  clientId?: number;
  onChange: (name: string, id?: number) => void;
}

export function ClientSelector({ value, clientId, onChange }: ClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<OdooCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Modal state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newVat, setNewVat] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value !== query) {
      setQuery(value);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Solo buscar si hay al menos 2 caracteres, y si el input no coincide con el cliente ya seleccionado
      if (query.trim().length >= 2 && isOpen) {
        setIsLoading(true);
        const res = await buscarClientesOdoo(query);
        if (res.exito && res.data) {
          setResults(res.data);
        } else {
          setResults([]);
        }
        setIsLoading(false);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const handleSelect = (customer: OdooCustomer) => {
    setQuery(customer.name);
    onChange(customer.name, customer.id);
    setIsOpen(false);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsCreating(true);
    const res = await crearClienteOdoo({
      name: newName,
      email: newEmail,
      vat: newVat,
      phone: newPhone
    });
    setIsCreating(false);

    if (res.exito && res.id) {
      setQuery(newName);
      onChange(newName, res.id);
      setShowForm(false);
      setIsOpen(false);
      // Reset form
      setNewName(''); setNewEmail(''); setNewVat(''); setNewPhone('');
    } else {
      alert(res.error || 'Error al crear cliente');
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value, undefined); // Resetea ID si escribe
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full p-2 pl-9 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
          placeholder="Buscar o ingresar Nombre..."
        />
        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        {isLoading && <Loader2 className="absolute right-3 top-2.5 text-slate-400 animate-spin" size={16} />}
      </div>

      {isOpen && query.trim().length >= 2 && !showForm && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.length > 0 ? (
            <ul>
              {results.map((c) => (
                <li
                  key={c.id}
                  className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Evita perder el foco y cerrar el popup antes de clickear
                    handleSelect(c);
                  }}
                >
                  <div className="font-medium text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                    {c.vat && <span>RUT: {c.vat}</span>}
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-slate-500">
              No se encontraron clientes con "{query}"
            </div>
          )}
          
          <div className="p-2 border-t border-slate-200 bg-slate-50 sticky bottom-0">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setNewName(query);
                setShowForm(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-sm font-medium transition-colors"
            >
              <UserPlus size={16} /> Crear nuevo cliente
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserPlus size={18} className="text-blue-600"/> Nuevo Cliente en Odoo
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateClient} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre Completo *</label>
                <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500 text-sm text-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">RUT (Opcional)</label>
                <input type="text" value={newVat} onChange={e => setNewVat(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500 text-sm text-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email (Opcional)</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500 text-sm text-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono (Opcional)</label>
                <input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500 text-sm text-slate-800" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" disabled={isCreating} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
