import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { AccompaniedBy, Attendee, PaymentMethod, TicketLevel } from '../types/index';
import { ShieldCheck, UserPlus, Trash2, Users, Plus, X, Pencil, Save, Search, ImageOff, RotateCcw, QrCode } from 'lucide-react';
import { QrCodesPanel } from '../components/QrCodesPanel';
import { PostEventExport } from '../components/PostEventExport';
import { downloadBlob, isLocalAddress, publicSiteUrl, qrPngWithLabel, safeFileName } from '../lib/badgeQr';
import { formatPhoneInput, formatCurrencyInput, matchesQuery } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { SpreadsheetImport } from '../components/SpreadsheetImport';

const ACCOMPANIED_BY_OPTIONS: AccompaniedBy[] = ['Esposo(a)', 'Professor parceiro', 'Colaborador', 'Amigo'];
const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ['Boleto', 'Cartão de Crédito'];
const MENTORSHIP_OPTIONS = ['Mentoria Partiu 10K', 'Professores de Elite'];
const CYCLE_OPTIONS = ['1º ciclo', '2º ciclo', '3º ciclo', '4º ciclo', '5º ciclo', 'Finalizado'];

const emptyForm = {
  name: '',
  phone: '',
  instagram: '',
  photoUrl: '',
  level: 'VIP' as TicketLevel,
  isSponsor: false,
  isMentee: false,
  nearRenewal: false,
  isAccompanied: false,
  accompaniedBy: '' as AccompaniedBy | '',
  companionName: '',
  currentMentorship: '',
  cycle: '',
  cycleEndDate: '',
  mentorshipRemaining: '',
  isPaying: false,
  paymentMethod: '' as PaymentMethod | '',
  installmentValue: '',
  remainingInstallments: '',
  mentorshipValue: '',
  amountPaid: '',
  creditBalance: '',
  offerToMake: '',
  specialCondition: ''
};

const attendeeToForm = (a: Attendee) => ({
  name: a.name,
  phone: a.phone,
  instagram: a.instagram,
  photoUrl: a.photoUrl ?? '',
  level: a.level,
  isSponsor: a.isSponsor ?? false,
  isMentee: a.isMentee,
  nearRenewal: a.nearRenewal,
  isAccompanied: a.isAccompanied,
  accompaniedBy: (a.accompaniedBy ?? '') as AccompaniedBy | '',
  companionName: a.companionName ?? '',
  currentMentorship: a.currentMentorship,
  cycle: a.cycle,
  cycleEndDate: a.cycleEndDate,
  mentorshipRemaining: a.mentorshipRemaining ?? '',
  isPaying: a.isPaying,
  paymentMethod: (a.paymentMethod ?? '') as PaymentMethod | '',
  installmentValue: a.installmentValue ?? '',
  remainingInstallments: a.remainingInstallments != null ? String(a.remainingInstallments) : '',
  mentorshipValue: a.mentorshipValue ?? '',
  amountPaid: a.amountPaid ?? '',
  creditBalance: a.creditBalance ?? '',
  offerToMake: a.offerToMake,
  specialCondition: a.specialCondition ?? ''
});

export const AdminPage: React.FC = () => {
  const { attendees, addAttendee, updateAttendee, deleteAttendee, closerNames, addCloserName, removeCloserName, resetPresence } = useApp();
  const [resetMessage, setResetMessage] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [newCloserName, setNewCloserName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [withoutPhotoOnly, setWithoutPhotoOnly] = useState(false);

  const listedAttendees = useMemo(
    () =>
      attendees.filter(
        a => matchesQuery(listSearch, [a.name, a.instagram], a.phone) && (!withoutPhotoOnly || !a.photoUrl)
      ),
    [attendees, listSearch, withoutPhotoOnly]
  );
  const withoutPhotoCount = attendees.filter(a => !a.photoUrl).length;
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (a: Attendee) => {
    setEditingId(a.id);
    setForm(attendeeToForm(a));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmitAttendee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const sharedFields = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      instagram: form.instagram.trim(),
      photoUrl: form.photoUrl.trim(),
      level: form.level,
      isSponsor: form.isSponsor,
      isMentee: form.isMentee,
      nearRenewal: form.nearRenewal,
      isAccompanied: form.isAccompanied,
      accompaniedBy: form.accompaniedBy || undefined,
      companionName: form.companionName.trim(),
      currentMentorship: form.currentMentorship.trim(),
      cycle: form.cycle.trim(),
      cycleEndDate: form.cycleEndDate.trim(),
      mentorshipRemaining: form.mentorshipRemaining.trim(),
      isPaying: form.isPaying,
      paymentMethod: form.paymentMethod || undefined,
      installmentValue: form.installmentValue.trim(),
      remainingInstallments: form.remainingInstallments ? Number(form.remainingInstallments) : undefined,
      mentorshipValue: form.mentorshipValue.trim(),
      amountPaid: form.amountPaid.trim(),
      creditBalance: form.creditBalance.trim(),
      offerToMake: form.offerToMake.trim(),
      specialCondition: form.specialCondition.trim()
    };

    if (editingId) {
      const original = attendees.find(a => a.id === editingId);
      if (!original) return;
      updateAttendee({ ...original, ...sharedFields });
      setEditingId(null);
    } else {
      const newAttendee: Attendee = {
        id: 'att-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ...sharedFields,
        status: 'CONFIRMED',
        isPresent: false,
        checkInTime: null,
        closerNotes: []
      };
      addAttendee(newAttendee);
    }

    setForm(emptyForm);
  };

  const handleAddCloser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCloserName.trim()) return;
    addCloserName(newCloserName.trim());
    setNewCloserName('');
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Painel Admin</h1>
          <p className="text-xs text-slate-500 mt-0.5">Gerencie participantes e a equipe de closers.</p>
        </div>
      </div>

      <SpreadsheetImport />

      <QrCodesPanel />

      <PostEventExport />

      {/* Participantes */}
      <div
        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${
          editingId ? 'border-slate-400 ring-1 ring-slate-300' : 'border-slate-200'
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-slate-500" />
            <span>{editingId ? `Editando: ${form.name}` : 'Adicionar Participante'}</span>
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar edição</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmitAttendee} className="p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Nome completo *"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
            <input
              type="text"
              placeholder="Telefone"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
              maxLength={15}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
            <input
              type="text"
              placeholder="Instagram (@usuario)"
              value={form.instagram}
              onChange={e => setForm({ ...form, instagram: e.target.value })}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
            <select
              value={form.level}
              onChange={e => setForm({ ...form, level: e.target.value as TicketLevel })}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
            >
              <option value="VIP">Ingresso VIP</option>
              <option value="SILVER">Ingresso SILVER</option>
            </select>
            <div className="sm:col-span-2 flex items-center gap-2.5">
              <Avatar name={form.name || '?'} photoUrl={form.photoUrl} className="w-10 h-10 rounded-lg" textClassName="text-xs" />
              <input
                type="url"
                placeholder="Link da foto (ex: https://...blob.vercel-storage.com/...)"
                value={form.photoUrl}
                onChange={e => setForm({ ...form, photoUrl: e.target.value })}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs pt-1">
            <label className="flex items-center gap-2 py-1.5 font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.isSponsor}
                onChange={e => setForm({ ...form, isSponsor: e.target.checked })}
              />
              <span>Patrocinador?</span>
            </label>
            <label className="flex items-center gap-2 py-1.5 font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.isMentee}
                onChange={e => setForm({ ...form, isMentee: e.target.checked })}
              />
              <span>Já é mentorado?</span>
            </label>
            <label className="flex items-center gap-2 py-1.5 font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.nearRenewal}
                onChange={e => setForm({ ...form, nearRenewal: e.target.checked })}
              />
              <span>Renovação próxima?</span>
            </label>
          </div>

          {/* Acompanhante */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <label className="flex items-center gap-2 py-1.5 font-semibold text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.isAccompanied}
                onChange={e => setForm({ ...form, isAccompanied: e.target.checked })}
              />
              <span>Está acompanhado?</span>
            </label>

            {form.isAccompanied && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={form.accompaniedBy}
                  onChange={e => setForm({ ...form, accompaniedBy: e.target.value as AccompaniedBy })}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                >
                  <option value="">Quem é o acompanhante?</option>
                  {ACCOMPANIED_BY_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Nome do acompanhante"
                  value={form.companionName}
                  onChange={e => setForm({ ...form, companionName: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
            )}
          </div>

          {/* Situação de mentoria */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700">Situação de Mentoria</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={form.currentMentorship}
                onChange={e =>
                  setForm({ ...form, currentMentorship: e.target.value, isMentee: e.target.value ? true : form.isMentee })
                }
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
              >
                <option value="">Mentoria atual</option>
                {MENTORSHIP_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <select
                value={form.cycle}
                onChange={e => setForm({ ...form, cycle: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
              >
                <option value="">Ciclo</option>
                {CYCLE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                <span>Fim do ciclo atual</span>
                <input
                  type="date"
                  value={form.cycleEndDate}
                  onChange={e => setForm({ ...form, cycleEndDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </label>
              <input
                type="text"
                placeholder="Quanto está sobrando da mentoria (ex: 2 meses)"
                value={form.mentorshipRemaining}
                onChange={e => setForm({ ...form, mentorshipRemaining: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />

              <label className="flex items-center gap-2 py-1.5 font-semibold text-xs text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isPaying}
                  onChange={e => setForm({ ...form, isPaying: e.target.checked })}
                />
                <span>Ainda está pagando?</span>
              </label>

              {form.isPaying && (
                <>
                  <select
                    value={form.paymentMethod}
                    onChange={e => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    <option value="">Forma de pagamento</option>
                    {PAYMENT_METHOD_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Valor da parcela (ex: R$ 897,00)"
                    value={form.installmentValue}
                    onChange={e => setForm({ ...form, installmentValue: formatCurrencyInput(e.target.value) })}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Parcelas restantes"
                    value={form.remainingInstallments}
                    onChange={e => setForm({ ...form, remainingInstallments: e.target.value })}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                  />
                </>
              )}

              <input
                type="text"
                placeholder="Valor da mentoria (ex: R$ 8.970,00)"
                value={form.mentorshipValue}
                onChange={e => setForm({ ...form, mentorshipValue: formatCurrencyInput(e.target.value) })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
              <input
                type="text"
                placeholder="Valor pago (ex: R$ 5.382,00)"
                value={form.amountPaid}
                onChange={e => setForm({ ...form, amountPaid: formatCurrencyInput(e.target.value) })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
              <input
                type="text"
                placeholder="Valor em haver (tempo restante em dinheiro)"
                value={form.creditBalance}
                onChange={e => setForm({ ...form, creditBalance: formatCurrencyInput(e.target.value) })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {/* Oferta */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700">Oferta</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Oferta a ser feita (ex: Mastermind)"
                value={form.offerToMake}
                onChange={e => setForm({ ...form, offerToMake: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
              <input
                type="text"
                placeholder="Condição especial"
                value={form.specialCondition}
                onChange={e => setForm({ ...form, specialCondition: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-5 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{editingId ? 'Salvar Alterações' : 'Adicionar Participante'}</span>
          </button>
        </form>

        <div className="border-t border-slate-200 p-3 sm:px-5 bg-slate-50 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Buscar entre ${attendees.length} participantes para editar...`}
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={() => setWithoutPhotoOnly(prev => !prev)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition ${
              withoutPhotoOnly ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            <ImageOff className="w-3.5 h-3.5" />
            <span>Sem foto ({withoutPhotoCount})</span>
          </button>
        </div>

        <div className="border-t border-slate-200 divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
          {listedAttendees.length === 0 ? (
            <p className="p-4 text-xs text-slate-500 italic">
              {attendees.length === 0 ? 'Nenhum participante cadastrado.' : 'Nenhum participante encontrado.'}
            </p>
          ) : (
            listedAttendees.map(a => (
              <div key={a.id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={a.name} photoUrl={a.photoUrl} className="w-9 h-9 rounded-lg" textClassName="text-xs" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <span className="truncate">{a.name}</span>
                      {a.isAccompanied && (
                        <span
                          className="inline-flex items-center bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0"
                          title={a.companionName ? `Acompanhante: ${a.companionName}` : 'Acompanhado(a)'}
                        >
                          Acompanhado
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{a.level} • {a.phone || 'sem telefone'}</div>
                  </div>
                </div>

                {confirmDeleteId === a.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        deleteAttendee(a.id);
                        setConfirmDeleteId(null);
                      }}
                      className="px-3 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="p-2.5 rounded-lg text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={async () => {
                        if (isLocalAddress(publicSiteUrl()) && !window.confirm('Endereço local: este QR NÃO vai funcionar nos celulares. Baixar mesmo assim?')) return;
                        downloadBlob(await qrPngWithLabel(a), `${safeFileName(a.name)}.png`);
                      }}
                      className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
                      title="Baixar QR Code do crachá"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startEdit(a)}
                      className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
                      title="Editar participante"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="p-2.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition"
                      title="Excluir participante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Equipe de Closers */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-500" />
            <span>Equipe de Closers</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Nomes disponíveis para seleção no login dos closers.
          </p>
        </div>

        <form onSubmit={handleAddCloser} className="p-4 sm:p-5 flex gap-2">
          <input
            type="text"
            placeholder="Nome do novo closer"
            value={newCloserName}
            onChange={e => setNewCloserName(e.target.value)}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar</span>
          </button>
        </form>

        <div className="border-t border-slate-200 p-4 sm:p-5 flex flex-wrap gap-2">
          {closerNames.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum closer cadastrado.</p>
          ) : (
            closerNames.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1 py-0.5 text-xs font-bold text-slate-800"
              >
                <span>{name}</span>
                <button
                  onClick={() => removeCloserName(name)}
                  className="p-2 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition"
                  title={`Remover ${name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Presenças: zerar depois do ensaio, antes do evento */}
      <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-rose-500" />
              <span>Zerar presenças</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Apaga o check-in de todos os participantes nos dois dias. Use depois do ensaio, antes de abrir o evento.
              {` Hoje: ${attendees.filter(a => a.checkIns?.day1 || a.checkIns?.day2).length} pessoa(s) com presença registrada.`}
            </p>
          </div>
          <button
            onClick={async () => {
              const typed = window.prompt('Isso apaga TODAS as presenças (Dia 1 e Dia 2). Para confirmar, digite ZERAR');
              if (typed?.trim().toUpperCase() !== 'ZERAR') return;
              const count = await resetPresence();
              if (count !== null) setResetMessage(`Presenças zeradas (${count} participante(s)).`);
            }}
            className="px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Zerar todas as presenças</span>
          </button>
          {resetMessage && <p className="text-xs font-semibold text-emerald-700">{resetMessage}</p>}
        </div>
      </div>
    </div>
  );
};
