import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Attendee, CloserNote, UserSession, UserRole } from '../types/index';
import { currentEventDay } from '../lib/eventDays';
import { INITIAL_ATTENDEES } from '../data/mockAttendees';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  attendeeFromRow,
  attendeeToRow,
  formatNoteDate,
  noteFromRow,
  type AttendeeRow,
  type CloserNoteRow
} from '../lib/attendeeMapper';

export type SyncStatus = 'local' | 'loading' | 'online' | 'offline';

interface AppContextType {
  attendees: Attendee[];
  closerNames: string[];
  userSession: UserSession;
  /** false enquanto a sessão salva ainda está sendo restaurada (evita mandar para o login no F5) */
  authReady: boolean;
  isSupabaseActive: boolean;
  syncStatus: SyncStatus;
  errorMessage: string | null;
  reportError: (message: string, err: unknown) => void;
  dismissError: () => void;
  /** Valida o PIN no servidor. Retorna a mensagem de erro, ou null se entrou. */
  login: (role: 'CLOSER' | 'ADMIN', pin: string, userName?: string) => Promise<string | null>;
  logout: () => Promise<void>;
  toggleCheckIn: (id: string) => void;
  updateAttendee: (updated: Attendee) => void;
  addCloserNote: (attendeeId: string, text: string, closerName: string) => void;
  addAttendee: (attendee: Attendee) => void;
  importAttendees: (list: Attendee[]) => Promise<boolean>;
  deleteAttendee: (id: string) => void;
  addCloserName: (name: string) => void;
  removeCloserName: (name: string) => void;
  /** Coloca a pessoa no lugar (ou esvazia o lugar com attendeeId null). Só admin. */
  assignSeat: (attendeeId: string | null, tableId: string, seat: number) => void;
  /** Tira do lugar quem está em cadeira de número maior que `seats` (nas mesas indicadas, ou em todas). */
  releaseSeatsAbove: (seats: number, tableId?: string) => void;
  /** Admin: apaga a presença de todos nos dois dias (ex: depois do ensaio). Retorna quantos foram zerados. */
  resetPresence: () => Promise<number | null>;
}

const STORAGE_KEY_ATTENDEES = 'helper_rise_attendees_v2';
const STORAGE_KEY_SESSION = 'helper_rise_session_v2';
const STORAGE_KEY_CLOSERS = 'helper_rise_closers_v1';

export const DEFAULT_CLOSER_NAMES = ['Carla', 'Davi', 'Emmy', 'Ricardo', 'Everton'];

const sortByName = (list: Attendee[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch (err) {
    console.error(`Failed to parse ${key}:`, err);
  }
  return fallback;
}

type TeamRole = 'CLOSER' | 'ADMIN';

const roleFromSession = (session: Session | null): TeamRole | null => {
  const role = session?.user?.app_metadata?.app_role;
  return role === 'CLOSER' || role === 'ADMIN' ? role : null;
};

// Visitante que abriu um crachá pelo QR Code não precisa da lista de participantes
const isPublicBadgeVisit = window.location.pathname.startsWith('/badge/');
// Rede de segurança caso algum aviso instantâneo se perca (ex: Wi-Fi oscilou)
const RECEPTION_POLL_MS = 30000;

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Com Supabase ativo, o localStorage é só cache offline — nunca exibimos os dados de exemplo
  // como se fossem reais. Sem Supabase (modo demonstração), usamos o mock.
  const [attendees, setAttendees] = useState<Attendee[]>(() =>
    readStorage(STORAGE_KEY_ATTENDEES, isSupabaseConfigured ? [] : INITIAL_ATTENDEES)
  );
  // Nome do closer e horário do login ficam no aparelho. O perfil (role) vem da sessão do
  // Supabase, validada no servidor; só no modo demonstração (sem Supabase) ele vem daqui.
  const [profile, setProfile] = useState<UserSession>(() => readStorage(STORAGE_KEY_SESSION, { role: null }));
  const [authRole, setAuthRole] = useState<TeamRole | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [closerNames, setCloserNames] = useState<string[]>(() => readStorage(STORAGE_KEY_CLOSERS, DEFAULT_CLOSER_NAMES));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'loading' : 'local');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reportError = useCallback((message: string, err: unknown) => {
    console.error(message, err);
    setErrorMessage(message);
  }, []);

  const dismissError = useCallback(() => setErrorMessage(null), []);

  const role: UserRole = isSupabaseConfigured ? authRole : profile.role;
  const isTeam = role === 'CLOSER' || role === 'ADMIN';
  const userSession: UserSession = { ...profile, role };

  // Restaura a sessão salva e acompanha login/logout/renovação do token
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthRole(roleFromSession(data.session));
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthRole(roleFromSession(session));
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const fetchAttendees = useCallback(async () => {
    if (!supabase) return;

    if (!isTeam) {
      // Recepção sem login: só os campos do credenciamento (função reception_list no banco)
      const { data, error } = await supabase.rpc('reception_list');
      if (error) {
        console.warn('Supabase reception fetch error, keeping cached data:', error);
        setSyncStatus('offline');
        return;
      }
      setAttendees(sortByName((data as AttendeeRow[]).map(row => attendeeFromRow(row, []))));
      setSyncStatus('online');
      return;
    }

    const [attRes, notesRes] = await Promise.all([
      supabase.from('attendees').select('*'),
      supabase.from('closer_notes').select('*').order('created_at', { ascending: false })
    ]);

    if (attRes.error || notesRes.error) {
      console.warn('Supabase fetch error, keeping cached data:', attRes.error || notesRes.error);
      setSyncStatus('offline');
      return;
    }

    const notesByAttendee = new Map<string, CloserNote[]>();
    for (const row of notesRes.data as CloserNoteRow[]) {
      const list = notesByAttendee.get(row.attendee_id) ?? [];
      list.push(noteFromRow(row));
      notesByAttendee.set(row.attendee_id, list);
    }

    const formatted = (attRes.data as AttendeeRow[]).map(row => attendeeFromRow(row, notesByAttendee.get(row.id) ?? []));
    setAttendees(sortByName(formatted));
    setSyncStatus('online');
  }, [isTeam]);

  const fetchClosers = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('closers').select('name').order('name');
    if (error) {
      console.warn('Supabase closers fetch error, keeping cached list:', error);
      return;
    }
    if (data && data.length > 0) {
      setCloserNames(data.map(row => row.name as string));
    }
  }, []);

  // Busca inicial + sincronização entre aparelhos.
  // Equipe logada: recebe as mudanças da tabela em tempo real.
  // Recepção sem login: não pode ler a tabela (dados financeiros), então recebe só um aviso
  // vazio no canal 'reception' a cada mudança e busca a lista resumida de novo.
  const refetchTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!supabase || !authReady) return;
    const client = supabase;
    const loadAttendees = isTeam || !isPublicBadgeVisit;

    if (loadAttendees) fetchAttendees();
    fetchClosers();

    // Várias mudanças seguidas (ex: importação) disparam um único refetch
    const scheduleRefetch = () => {
      window.clearTimeout(refetchTimer.current);
      refetchTimer.current = window.setTimeout(fetchAttendees, 300);
    };

    let channel = client
      .channel(`helper-sync-${isTeam ? 'team' : 'public'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closers' }, () => fetchClosers());
    if (isTeam) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendees' }, scheduleRefetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_notes' }, scheduleRefetch);
    }
    channel.subscribe();

    const receptionChannel =
      !isTeam && loadAttendees
        ? client.channel('reception').on('broadcast', { event: 'changed' }, scheduleRefetch).subscribe()
        : undefined;

    const poll =
      !isTeam && loadAttendees
        ? window.setInterval(() => {
            if (document.visibilityState === 'visible') fetchAttendees();
          }, RECEPTION_POLL_MS)
        : undefined;

    // Ao voltar para a aba ou recuperar a conexão, garante que nada ficou para trás
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        if (loadAttendees) fetchAttendees();
        fetchClosers();
      }
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onResume);

    return () => {
      window.clearTimeout(refetchTimer.current);
      window.clearInterval(poll);
      client.removeChannel(channel);
      if (receptionChannel) client.removeChannel(receptionChannel);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onResume);
    };
  }, [authReady, isTeam, fetchAttendees, fetchClosers]);

  // Save to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ATTENDEES, JSON.stringify(attendees));
    } catch (err) {
      console.error('Failed to save attendees:', err);
    }
  }, [attendees]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(profile));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLOSERS, JSON.stringify(closerNames));
    } catch (err) {
      console.error('Failed to save closer names:', err);
    }
  }, [closerNames]);

  const login = async (newRole: TeamRole, pin: string, userName?: string): Promise<string | null> => {
    const newProfile: UserSession = {
      role: newRole,
      userName: userName || (newRole === 'CLOSER' ? 'Closer Rise' : 'Admin'),
      loggedInAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    // Modo demonstração (sem Supabase configurado): não há servidor para validar o PIN
    if (!supabase) {
      setProfile(newProfile);
      return null;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, pin })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error || 'Não foi possível entrar. Tente novamente.';

      const { data, error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token
      });
      if (error || roleFromSession(data.session) !== newRole) {
        console.error('setSession failed:', error);
        return 'Não foi possível entrar. Tente novamente.';
      }

      setAuthRole(newRole);
      setProfile(newProfile);
      return null;
    } catch (err) {
      console.error('Login request failed:', err);
      return 'Sem conexão com o servidor. Verifique a internet.';
    }
  };

  const logout = async () => {
    // scope 'local': todos os closers compartilham o mesmo usuário no Supabase;
    // o padrão ('global') desconectaria a equipe inteira.
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    setAuthRole(null);
    setProfile({ role: null });
    // Não deixa dados financeiros no aparelho depois de sair
    setAttendees([]);
    try {
      localStorage.removeItem(STORAGE_KEY_ATTENDEES);
    } catch {
      // armazenamento indisponível: nada a limpar
    }
  };

  /**
   * Executa a escrita no Supabase. Em caso de erro, avisa o usuário e recarrega do banco
   * para desfazer a atualização otimista que já foi aplicada na tela.
   */
  const persist = async (
    action: string,
    run: (client: NonNullable<typeof supabase>) => PromiseLike<{ error: unknown }>
  ): Promise<boolean> => {
    if (!supabase) return true;
    try {
      const { error } = await run(supabase);
      if (error) throw error;
      return true;
    } catch (err) {
      reportError(`Não foi possível ${action}. Verifique a conexão e tente novamente.`, err);
      fetchAttendees();
      return false;
    }
  };

  const toggleCheckIn = (id: string) => {
    const target = attendees.find(a => a.id === id);
    if (!target) return;

    const isPresent = !target.isPresent;
    const dayKey = currentEventDay() === 2 ? 'day2' : 'day1';
    const setPresence = (checkInTime: string | null) =>
      setAttendees(prev =>
        prev.map(item =>
          item.id === id
            ? {
                ...item,
                isPresent,
                checkInTime,
                checkIns: { day1: item.checkIns?.day1 ?? null, day2: item.checkIns?.day2 ?? null, [dayKey]: checkInTime }
              }
            : item
        )
      );

    setPresence(isPresent ? new Date().toISOString() : null);

    // Função set_presence: única escrita liberada para a recepção sem login; o horário vem do servidor
    persist(isPresent ? 'confirmar a presença' : 'desfazer a presença', async client => {
      const result = await client.rpc('set_presence', { p_id: id, p_present: isPresent });
      if (!result.error) setPresence((result.data as string | null) ?? null);
      return result;
    });
  };

  const updateAttendee = (updated: Attendee) => {
    setAttendees(prev => sortByName(prev.map(item => (item.id === updated.id ? updated : item))));

    // Presença é responsabilidade da recepção: não sobrescreve um check-in feito
    // em outro aparelho enquanto o formulário de edição estava aberto.
    // O lugar no mapa também não: ele só muda pelo editor do mapa (assign_seat).
    const fields: Partial<AttendeeRow> = attendeeToRow(updated);
    delete fields.id;
    delete fields.is_present;
    delete fields.check_in_time;
    delete fields.check_in_day1;
    delete fields.check_in_day2;
    delete fields.table_id;
    delete fields.seat_number;
    persist('salvar as alterações do participante', client =>
      client.from('attendees').update(fields).eq('id', updated.id)
    );
  };

  const addCloserNote = (attendeeId: string, text: string, closerName: string) => {
    const author = closerName || 'Closer';
    const newNote: CloserNote = {
      id: 'note_' + Date.now(),
      date: formatNoteDate(new Date()),
      text,
      closerName: author
    };

    setAttendees(prev =>
      prev.map(item => (item.id === attendeeId ? { ...item, closerNotes: [newNote, ...(item.closerNotes || [])] } : item))
    );

    persist('salvar a anotação', client =>
      client.from('closer_notes').insert({ attendee_id: attendeeId, text, closer_name: author })
    );
  };

  const addAttendee = (attendee: Attendee) => {
    setAttendees(prev => sortByName([attendee, ...prev]));
    persist('cadastrar o participante', client => client.from('attendees').insert(attendeeToRow(attendee)));
  };

  /** Cria ou atualiza vários participantes de uma vez (importação de planilha). */
  const importAttendees = async (list: Attendee[]): Promise<boolean> => {
    if (list.length === 0) return true;

    const incoming = new Map(list.map(a => [a.id, a]));
    setAttendees(prev => {
      const merged = prev.map(item => incoming.get(item.id) ?? item);
      const existingIds = new Set(prev.map(item => item.id));
      return sortByName([...merged, ...list.filter(a => !existingIds.has(a.id))]);
    });

    // Sem is_present/check_in_time no payload: novos entram com o padrão (ausente)
    // e os existentes mantêm a presença registrada pela recepção.
    const rows = list.map(a => {
      const row: Partial<AttendeeRow> = attendeeToRow(a);
      delete row.is_present;
      delete row.check_in_time;
      delete row.check_in_day1;
      delete row.check_in_day2;
      delete row.table_id;
      delete row.seat_number;
      return row;
    });

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const ok = await persist('importar a planilha', client => client.from('attendees').upsert(chunk, { onConflict: 'id' }));
      if (!ok) return false;
    }
    return true;
  };

  const deleteAttendee = (id: string) => {
    setAttendees(prev => prev.filter(item => item.id !== id));
    persist('excluir o participante', client => client.from('attendees').delete().eq('id', id));
  };

  const addCloserName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCloserNames(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    const ok = await persist('adicionar o closer', client => client.from('closers').insert({ name: trimmed }));
    if (!ok) fetchClosers();
  };

  const assignSeat = (attendeeId: string | null, tableId: string, seat: number) => {
    setAttendees(prev =>
      prev.map(item => {
        if (item.id === attendeeId) return { ...item, tableId, seatNumber: seat };
        // Quem ocupava o lugar fica sem lugar
        if (item.tableId === tableId && item.seatNumber === seat) return { ...item, tableId: undefined, seatNumber: undefined };
        return item;
      })
    );
    persist('alterar o lugar', client =>
      client.rpc('assign_seat', { p_attendee_id: attendeeId, p_table_id: tableId, p_seat: seat })
    );
  };

  const releaseSeatsAbove = (seats: number, tableId?: string) => {
    const affected = (a: Attendee) => Boolean(a.tableId) && (!tableId || a.tableId === tableId) && (a.seatNumber ?? 0) > seats;
    if (!attendees.some(affected)) return;
    setAttendees(prev => prev.map(item => (affected(item) ? { ...item, tableId: undefined, seatNumber: undefined } : item)));
    persist('liberar os lugares', client => {
      const query = client.from('attendees').update({ table_id: null, seat_number: null }).gt('seat_number', seats);
      return tableId ? query.eq('table_id', tableId) : query.not('table_id', 'is', null);
    });
  };

  const resetPresence = async (): Promise<number | null> => {
    if (!supabase) {
      setAttendees(prev => prev.map(item => ({ ...item, isPresent: false, checkInTime: null, checkIns: { day1: null, day2: null } })));
      return attendees.filter(a => a.checkIns?.day1 || a.checkIns?.day2 || a.isPresent).length;
    }
    const { data, error } = await supabase.rpc('reset_presence');
    if (error) {
      reportError('Não foi possível zerar as presenças. Verifique a conexão e tente novamente.', error);
      return null;
    }
    await fetchAttendees();
    return data as number;
  };

  const removeCloserName = async (name: string) => {
    setCloserNames(prev => prev.filter(item => item !== name));
    const ok = await persist('remover o closer', client => client.from('closers').delete().eq('name', name));
    if (!ok) fetchClosers();
  };

  return (
    <AppContext.Provider
      value={{
        attendees,
        closerNames,
        userSession,
        authReady,
        isSupabaseActive: isSupabaseConfigured,
        syncStatus,
        errorMessage,
        reportError,
        dismissError,
        login,
        logout,
        toggleCheckIn,
        updateAttendee,
        addCloserNote,
        addAttendee,
        importAttendees,
        deleteAttendee,
        addCloserName,
        removeCloserName,
        assignSeat,
        releaseSeatsAbove,
        resetPresence
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
