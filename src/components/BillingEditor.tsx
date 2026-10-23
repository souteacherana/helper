import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, X } from 'lucide-react';
import type { Attendee } from '../types/index';
import { getBadgeLevel } from '../types/index';
import { BadgePill } from './BadgePill';
import {
  BILLING_FIELDS,
  BILLING_SOURCE_LABELS,
  BR_STATES,
  MARITAL_STATUS_SUGGESTIONS,
  NATIONALITY_SUGGESTIONS,
  billingErrors,
  formatBillingInput,
  isRequiredField,
  missingBillingFields,
  type BillingField,
  type BillingProfile,
  type PersonType
} from '../lib/billing';

interface BillingEditorProps {
  attendee: Attendee;
  initial: BillingProfile;
  onSave: (profile: BillingProfile) => Promise<boolean>;
  onClose: () => void;
}

const INPUT_MODE: Partial<Record<BillingField, React.HTMLAttributes<HTMLInputElement>['inputMode']>> = {
  cpf: 'numeric',
  zipCode: 'numeric',
  addressNumber: 'numeric',
  phone: 'tel',
  email: 'email'
};

const DATALIST: Partial<Record<BillingField, string[]>> = {
  nationality: NATIONALITY_SUGGESTIONS,
  maritalStatus: MARITAL_STATUS_SUGGESTIONS,
  state: BR_STATES
};

const SPAN_FULL: BillingField[] = ['companyName', 'fullName', 'street'];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2.5">
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
  </section>
);

/** Editor da ficha de cobrança: de baixo para cima no celular, janela central no computador. */
export const BillingEditor: React.FC<BillingEditorProps> = ({ attendee, initial, onSave, onClose }) => {
  const [profile, setProfile] = useState<BillingProfile>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = profile !== initial;

  const errors = useMemo(() => billingErrors(profile), [profile]);
  const missing = useMemo(() => missingBillingFields(profile), [profile]);
  const hasErrors = Object.keys(errors).length > 0;

  const close = () => {
    if (dirty && !window.confirm('Sair sem salvar as alterações desta ficha?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  });

  const setField = (key: BillingField, raw: string) =>
    setProfile(prev => ({
      ...prev,
      [key]: formatBillingInput(key, raw),
      sources: { ...prev.sources, [key]: 'manual' }
    }));

  const setPersonType = (personType: PersonType) => setProfile(prev => ({ ...prev, personType }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return;
    setSaving(true);
    const ok = await onSave(profile);
    setSaving(false);
    if (ok) onClose();
  };

  const field = (key: BillingField) => {
    const def = BILLING_FIELDS[key];
    const required = isRequiredField(key, profile.personType);
    const source = profile[key] ? profile.sources[key] : undefined;
    const error = errors[key];
    const listId = DATALIST[key] ? `billing-${key}` : undefined;
    return (
      <label key={key} className={`flex flex-col gap-1 ${SPAN_FULL.includes(key) ? 'sm:col-span-2' : ''}`}>
        <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
          <span>
            {def.label}
            {required && <span className="text-rose-600"> *</span>}
          </span>
          {source && (
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{BILLING_SOURCE_LABELS[source]}</span>
          )}
        </span>
        <input
          type={key === 'email' ? 'email' : 'text'}
          inputMode={INPUT_MODE[key]}
          autoComplete="off"
          list={listId}
          value={profile[key]}
          onChange={e => setField(key, e.target.value)}
          aria-invalid={Boolean(error)}
          className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none ${
            error ? 'border-rose-400 focus:border-rose-600' : 'border-slate-300 focus:border-slate-900'
          }`}
        />
        {listId && (
          <datalist id={listId}>
            {DATALIST[key]!.map(v => (
              <option key={v} value={v} />
            ))}
          </datalist>
        )}
        {error && <span className="text-[11px] font-semibold text-rose-600">{error}</span>}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Dados de cobrança de ${attendee.name}`}>
      <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />

      <form onSubmit={handleSave} className="relative w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-200" />
        <header className="px-5 pt-3 pb-3 md:pt-5 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900 truncate">{attendee.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <BadgePill level={getBadgeLevel(attendee)} size="sm" />
              {profile.asaasCustomerId && (
                <span className="text-[11px] text-slate-500">Asaas: <span className="font-mono">{profile.asaasCustomerId}</span></span>
              )}
            </div>
          </div>
          <button type="button" onClick={close} className="p-2.5 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
            {(['PF', 'PJ'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setPersonType(type)}
                aria-pressed={profile.personType === type}
                className={`py-2.5 px-2 rounded-lg text-xs font-bold transition ${
                  profile.personType === type ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {type === 'PF' ? 'Pessoa física' : 'Empresa (CNPJ)'}
              </button>
            ))}
          </div>

          {profile.personType === 'PJ' && <Section title="Empresa">{(['companyName', 'tradeName', 'cnpj'] as const).map(field)}</Section>}

          <Section title={profile.personType === 'PJ' ? 'Representante que assina' : 'Pessoa'}>
            {(['fullName', 'cpf', 'rg', 'nationality', 'maritalStatus'] as const).map(field)}
          </Section>

          <Section title="Contato">{(['email', 'phone'] as const).map(field)}</Section>

          <Section title="Endereço">
            {(['zipCode', 'street', 'addressNumber', 'complement', 'district', 'city', 'state'] as const).map(field)}
          </Section>
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0 text-xs">
            {missing.length === 0 ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Ficha completa para cobrança e contrato
              </span>
            ) : (
              <span className="flex items-start gap-1.5 font-semibold text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>Falta: {missing.join(', ')}. Pode salvar e completar depois.</span>
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving || hasErrors || !dirty}
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs py-3 px-5 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : hasErrors ? 'Corrija os campos em vermelho' : 'Salvar ficha'}</span>
          </button>
        </footer>
      </form>
    </div>
  );
};
