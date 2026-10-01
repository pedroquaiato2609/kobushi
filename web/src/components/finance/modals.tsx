import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Activity, FinAccount, FinCategory, FinGoal, FinRecurring, FinTransaction, TxKind } from '../../api/types';
import { brl, centsToInput, parseMoney } from '../../lib/money';
import { ErrorText, Field, Modal } from '../ui';
import { useConfirm } from '../ConfirmProvider';
import { useReauth } from '../AuthGate';
import { ACCOUNT_KIND, CATEGORY_PALETTE, CategorySelect, suggestCategoryId } from './shared';

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const KINDS: { id: TxKind; label: string }[] = [{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }, { id: 'transfer', label: 'Transferência' }];
const FREQ_LABEL = { weekly: 'semana', monthly: 'mês', yearly: 'ano' } as const;

function Footer({ busy, onDelete, label = 'Salvar' }: { busy: boolean; onDelete?: () => void; label?: string }) {
  return (
    <>
      <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : label}</button>
      {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Excluir</button>}
    </>
  );
}

export function TransactionModal({ tx, accounts, categories, initial, onClose }: {
  tx?: FinTransaction | null; accounts: FinAccount[]; categories: FinCategory[]; initial?: Partial<FinTransaction>; onClose: () => void;
}) {
  const confirm = useConfirm();
  const usable = accounts.filter((a) => !a.archived);
  const [kind, setKind] = useState<TxKind>(tx?.kind ?? initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(centsToInput(tx?.amountCents ?? initial?.amountCents));
  const [date, setDate] = useState(tx?.occurredOn ?? initial?.occurredOn ?? localToday());
  const [description, setDescription] = useState(tx?.description ?? initial?.description ?? '');
  const [merchant, setMerchant] = useState(tx?.merchant ?? '');
  const [accountId, setAccountId] = useState(tx?.accountId ?? initial?.accountId ?? usable.find((a) => a.kind !== 'credit_card')?.id ?? usable[0]?.id ?? '');
  const [toId, setToId] = useState(tx?.transferAccountId ?? '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  // sugere a categoria pela descrição/estabelecimento até o usuário escolher uma com a mão
  const [catAuto, setCatAuto] = useState(!tx && !initial?.categoryId);
  const [catSuggested, setCatSuggested] = useState(false);
  useEffect(() => {
    if (!catAuto || kind === 'transfer') return;
    const hit = suggestCategoryId(`${description} ${merchant}`, categories, kind);
    if (hit) { setCategoryId(hit); setCatSuggested(true); }
  }, [description, merchant, kind, catAuto, categories]);
  const [status, setStatus] = useState<'pending' | 'confirmed'>(tx?.status ?? initial?.status ?? 'confirmed');
  const [remind, setRemind] = useState(tx?.remindDaysBefore === null || tx?.remindDaysBefore === undefined ? '' : String(tx.remindDaysBefore));
  const [note, setNote] = useState(tx?.note ?? '');
  const [link, setLink] = useState(tx?.linkActivityId ?? '');
  const [err, setErr] = useState<Error | null>(null);
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

  const save = useAction((body: Record<string, unknown>) => (tx ? api.patch(`/finance/transactions/${tx.id}`, body) : api.post('/finance/transactions', body)), onClose);
  const del = useAction(() => api.del(`/finance/transactions/${tx?.id}`), onClose);

  function submit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setErr(new Error('Informe um valor maior que zero.'));
    if (!accountId) return setErr(new Error('Escolha uma conta. Se ainda não tem, crie uma primeiro.'));
    if (kind === 'transfer' && (!toId || toId === accountId)) return setErr(new Error('Escolha uma conta de destino diferente da de origem.'));
    setErr(null);
    save.mutate({
      accountId, kind, amountCents: cents, occurredOn: date, description, merchant, categoryId: kind === 'transfer' ? null : categoryId || null,
      status, transferAccountId: kind === 'transfer' ? toId : null, note, linkActivityId: link || null,
      remindDaysBefore: status === 'pending' && remind !== '' ? Number(remind) : null,
    });
  }

  return (
    <Modal title={tx ? 'Editar movimentação' : 'Nova movimentação'} onClose={onClose} onSubmit={submit}
      footer={<Footer busy={save.isPending} onDelete={tx ? async () => { if (await confirm('Excluir esta movimentação? Não dá para desfazer.')) del.mutate(undefined); } : undefined} />}>
      <div className="btn-group seg-wide" role="group" aria-label="Tipo">
        {KINDS.map((k) => <button key={k.id} type="button" className="btn" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
      <div className="form-row">
        <Field label="Valor (R$)"><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      <Field label="Descrição"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Compras do mês'} /></Field>
      {kind !== 'transfer' && <Field label="Estabelecimento (opcional)"><input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>}
      <div className="form-row">
        <Field label={kind === 'transfer' ? 'Conta de origem' : 'Conta / cartão'}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
            {usable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {kind === 'transfer'
          ? <Field label="Conta de destino"><select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">Escolha…</option>{usable.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          : <Field label="Categoria">
              <CategorySelect categories={categories} kind={kind} value={categoryId} onChange={(v) => { setCategoryId(v); setCatAuto(false); setCatSuggested(false); }} />
              {catAuto && catSuggested && categoryId && <small className="hint">Sugestão automática pelo texto — pode trocar.</small>}
            </Field>}
      </div>
      <Field label="Situação">
        <div className="btn-group" role="group" aria-label="Situação">
          <button type="button" className="btn" aria-pressed={status === 'confirmed'} onClick={() => setStatus('confirmed')}>Confirmada</button>
          <button type="button" className="btn" aria-pressed={status === 'pending'} onClick={() => setStatus('pending')}>Pendente (a pagar/receber)</button>
        </div>
      </Field>
      {status === 'pending' && (
        <Field label="Avisar quantos dias antes do vencimento? (vazio = não avisar)">
          <input type="number" min={0} max={30} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="Ex.: 3" />
        </Field>
      )}
      {kind === 'expense' && (activities.data ?? []).length > 0 && (
        <Field label="Relacionar a um objetivo (opcional)">
          <select value={link} onChange={(e) => setLink(e.target.value)}><option value="">Nenhum</option>{(activities.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
      )}
      <Field label="Observação"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorText error={err ?? save.error ?? del.error} />
    </Modal>
  );
}

export function AccountModal({ account, onClose }: { account?: FinAccount | null; onClose: () => void }) {
  const { guard } = useReauth();
  const confirm = useConfirm();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<FinAccount['kind']>(account?.kind ?? 'checking');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [number, setNumber] = useState('');
  const [initial, setInitial] = useState(centsToInput(account?.initialBalanceCents ?? 0));
  const [limit, setLimit] = useState(centsToInput(account?.creditLimitCents));
  const [closing, setClosing] = useState(String(account?.closingDay ?? ''));
  const [due, setDue] = useState(String(account?.dueDay ?? ''));
  const [remind, setRemind] = useState(account?.invoiceRemindDays === null || account?.invoiceRemindDays === undefined ? '' : String(account.invoiceRemindDays));
  const [err, setErr] = useState<Error | null>(null);
  const card = kind === 'credit_card';

  const save = useAction((body: Record<string, unknown>) => (account ? api.patch(`/finance/accounts/${account.id}`, body) : api.post('/finance/accounts', body)), onClose);
  const archive = useAction(() => api.patch(`/finance/accounts/${account?.id}`, { archived: true }), onClose);
  const del = useAction(() => guard(() => api.del(`/finance/accounts/${account?.id}`)), onClose);

  function submit() {
    const initialCents = parseMoney(initial || '0');
    if (initialCents === null) return setErr(new Error('Saldo inicial inválido.'));
    if (card && (!closing || !due)) return setErr(new Error('Informe o dia de fechamento e o de vencimento da fatura.'));
    setErr(null);
    save.mutate({
      name, kind, institution, initialBalanceCents: initialCents,
      ...(number ? { number } : {}),
      ...(card ? { creditLimitCents: limit ? parseMoney(limit) : null, closingDay: Number(closing), dueDay: Number(due), invoiceRemindDays: remind === '' ? null : Number(remind) } : {}),
    });
  }

  return (
    <Modal title={account ? 'Editar conta' : 'Nova conta'} onClose={onClose} onSubmit={submit}
      footer={<><Footer busy={save.isPending} />{account && <button type="button" className="btn ghost" onClick={() => archive.mutate(undefined)}>Arquivar</button>}{account && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Excluir a conta apaga TAMBÉM todas as movimentações dela. Continuar?')) del.mutate(undefined); }}>Excluir</button>}</>}>
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta principal" required autoFocus /></Field>
      <div className="form-row">
        <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value as FinAccount['kind'])}>{Object.entries(ACCOUNT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Instituição"><input value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field>
      </div>
      <Field label={card ? 'Dívida atual do cartão (negativa, se houver)' : 'Saldo inicial (R$)'}><input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} /></Field>
      {card && (
        <>
          <div className="form-row">
            <Field label="Dia de fechamento"><input type="number" min={1} max={31} value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
            <Field label="Dia de vencimento"><input type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <div className="form-row">
            <Field label="Limite (R$)"><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
            <Field label="Avisar da fatura (dias antes)"><input type="number" min={0} max={30} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="Ex.: 3" /></Field>
          </div>
        </>
      )}
      <Field label={account?.numberMask ? `Número da conta (guardado: ${account.numberMask}) — preencha só para trocar` : 'Número da conta (opcional)'}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
      </Field>
      <p className="hint">O número é criptografado no servidor; o app só mostra os 4 últimos dígitos. Nunca informe senhas bancárias.</p>
      <ErrorText error={err ?? save.error ?? archive.error ?? del.error} />
    </Modal>
  );
}

export function PayInvoiceModal({ card, accounts, amountCents, onClose }: { card: FinAccount; accounts: FinAccount[]; amountCents: number; onClose: () => void }) {
  const from = accounts.filter((a) => a.kind !== 'credit_card' && !a.archived);
  const [fromId, setFromId] = useState(from[0]?.id ?? '');
  const [amount, setAmount] = useState(centsToInput(amountCents));
  const [date, setDate] = useState(localToday());
  const [err, setErr] = useState<Error | null>(null);
  const pay = useAction((b: { fromAccountId: string; amountCents: number; date: string }) => api.post(`/finance/accounts/${card.id}/pay-invoice`, b), onClose);
  return (
    <Modal title={`Pagar fatura — ${card.name}`} onClose={onClose}
      onSubmit={() => { const c = parseMoney(amount); if (!c || c <= 0) return setErr(new Error('Informe o valor pago.')); if (!fromId) return setErr(new Error('Escolha a conta de origem.')); setErr(null); pay.mutate({ fromAccountId: fromId, amountCents: c, date }); }}
      footer={<Footer busy={pay.isPending} label="Registrar pagamento" />}>
      <p className="muted">Isso registra o pagamento como uma transferência da conta para o cartão. O Ninshiki não move dinheiro de verdade: apenas anota o que você já pagou no banco.</p>
      <Field label="Pago com"><select value={fromId} onChange={(e) => setFromId(e.target.value)}>{from.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <div className="form-row">
        <Field label="Valor (R$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Data do pagamento"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <ErrorText error={err ?? pay.error} />
    </Modal>
  );
}

/** Cria ou edita uma categoria (nome, cor e, opcionalmente, uma categoria-mãe). O tipo (despesa/receita) é fixo depois de criada. */
export function CategoryModal({ category, categories, onClose }: { category?: FinCategory | null; categories: FinCategory[]; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(category?.kind ?? 'expense');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [color, setColor] = useState(category?.color ?? CATEGORY_PALETTE[0]);
  const [err, setErr] = useState<Error | null>(null);
  const hasChildren = categories.some((c) => c.parentId === category?.id);
  const parentOptions = categories.filter((c) => !c.parentId && c.kind === kind && c.id !== category?.id);

  const save = useAction(
    (body: Record<string, unknown>) => (category ? api.patch<FinCategory>(`/finance/categories/${category.id}`, body) : api.post<FinCategory>('/finance/categories', body)),
    onClose,
  );
  function submit() {
    if (!name.trim()) return setErr(new Error('Dê um nome à categoria.'));
    setErr(null);
    save.mutate(category ? { name: name.trim(), parentId: parentId || null, color } : { name: name.trim(), kind, parentId: parentId || null, color });
  }

  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} onSubmit={submit}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button></>}>
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pet, Academia…" autoFocus required maxLength={60} /></Field>
      {!category && (
        <Field label="Tipo">
          <div className="btn-group seg-wide" role="group" aria-label="Tipo">
            <button type="button" className="btn" aria-pressed={kind === 'expense'} onClick={() => { setKind('expense'); setParentId(''); }}>Despesa</button>
            <button type="button" className="btn" aria-pressed={kind === 'income'} onClick={() => { setKind('income'); setParentId(''); }}>Receita</button>
          </div>
        </Field>
      )}
      {hasChildren
        ? <p className="hint">Esta categoria já tem subcategorias, por isso não pode virar subcategoria de outra.</p>
        : parentOptions.length > 0 && (
          <Field label="Dentro de (opcional)">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Categoria própria (sem mãe)</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
      <Field label="Cor">
        <div className="color-swatches" role="group" aria-label="Cor da categoria">
          {CATEGORY_PALETTE.map((c) => (
            <button key={c} type="button" className={`color-swatch${color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
          ))}
        </div>
      </Field>
      <ErrorText error={err ?? save.error} />
    </Modal>
  );
}

export function BudgetModal({ categories, taken, onClose }: { categories: FinCategory[]; taken: (string | null)[]; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState('');
  const [limit, setLimit] = useState('');
  const [err, setErr] = useState<Error | null>(null);
  const save = useAction((b: { categoryId: string | null; limitCents: number }) => api.put('/finance/budgets', b), onClose);
  return (
    <Modal title="Limite mensal" onClose={onClose}
      onSubmit={() => { const c = parseMoney(limit); if (!c || c <= 0) return setErr(new Error('Informe um limite maior que zero.')); setErr(null); save.mutate({ categoryId: categoryId || null, limitCents: c }); }}
      footer={<Footer busy={save.isPending} />}>
      <Field label="Categoria"><CategorySelect categories={categories} kind="expense" value={categoryId} onChange={setCategoryId} noneLabel="Geral (todas as despesas)" /></Field>
      {taken.includes(categoryId || null) && <p className="hint">Já existe um limite para esta categoria: salvar vai atualizá-lo.</p>}
      <Field label="Limite por mês (R$)"><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="600,00" autoFocus /></Field>
      <ErrorText error={err ?? save.error} />
    </Modal>
  );
}

export function GoalModal({ goal, onClose }: { goal?: FinGoal | null; onClose: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(centsToInput(goal?.targetCents));
  const [current, setCurrent] = useState(centsToInput(goal?.currentCents ?? 0));
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [err, setErr] = useState<Error | null>(null);
  const save = useAction((b: Record<string, unknown>) => (goal ? api.patch(`/finance/goals/${goal.id}`, b) : api.post('/finance/goals', b)), onClose);
  const del = useAction(() => api.del(`/finance/goals/${goal?.id}`), onClose);
  return (
    <Modal title={goal ? 'Editar meta' : 'Nova meta de economia'} onClose={onClose}
      onSubmit={() => { const t = parseMoney(target); const c = parseMoney(current || '0'); if (!t || t <= 0) return setErr(new Error('Informe o valor alvo.')); if (c === null || c < 0) return setErr(new Error('Valor já guardado inválido.')); setErr(null); save.mutate({ name, targetCents: t, currentCents: c, deadline: deadline || null }); }}
      footer={<Footer busy={save.isPending} onDelete={goal ? async () => { if (await confirm('Excluir esta meta?')) del.mutate(undefined); } : undefined} />}>
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Viagem" required autoFocus /></Field>
      <div className="form-row">
        <Field label="Valor alvo (R$)"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Já guardado (R$)"><input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      </div>
      <Field label="Prazo (opcional)"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      <ErrorText error={err ?? save.error ?? del.error} />
    </Modal>
  );
}

export function ContributeModal({ goal, onClose }: { goal: FinGoal; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const save = useAction((cents: number) => api.post(`/finance/goals/${goal.id}/contribute`, { amountCents: cents }), onClose);
  return (
    <Modal title={`${withdraw ? 'Retirar de' : 'Guardar em'} “${goal.name}”`} onClose={onClose}
      onSubmit={() => { const c = parseMoney(amount); if (!c || c <= 0) return setErr(new Error('Informe um valor maior que zero.')); setErr(null); save.mutate(withdraw ? -c : c); }}
      footer={<Footer busy={save.isPending} label="Confirmar" />}>
      <div className="btn-group" role="group"><button type="button" className="btn" aria-pressed={!withdraw} onClick={() => setWithdraw(false)}>Guardar</button><button type="button" className="btn" aria-pressed={withdraw} onClick={() => setWithdraw(true)}>Retirar</button></div>
      <Field label="Valor (R$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      <p className="hint">Isto ajusta o acompanhamento da meta; não movimenta dinheiro entre contas.</p>
      <ErrorText error={err ?? save.error} />
    </Modal>
  );
}

export function RecurringModal({ rec, accounts, categories, onClose }: { rec?: FinRecurring | null; accounts: FinAccount[]; categories: FinCategory[]; onClose: () => void }) {
  const confirm = useConfirm();
  const usable = accounts.filter((a) => !a.archived);
  const [description, setDescription] = useState(rec?.description ?? '');
  const [amount, setAmount] = useState(centsToInput(rec?.amountCents));
  const [kind, setKind] = useState<'expense' | 'income'>(rec?.kind ?? 'expense');
  const [frequency, setFrequency] = useState<FinRecurring['frequency']>(rec?.frequency ?? 'monthly');
  const [nextDue, setNextDue] = useState(rec?.nextDue ?? localToday());
  const [accountId, setAccountId] = useState(rec?.accountId ?? usable[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? '');
  const [sub, setSub] = useState(rec?.isSubscription ?? false);
  const [discount, setDiscount] = useState(rec?.discountPct != null ? String(rec.discountPct).replace('.', ',') : '');
  const [remind, setRemind] = useState(rec?.remindDaysBefore === null || rec?.remindDaysBefore === undefined ? '' : String(rec.remindDaysBefore));
  const [err, setErr] = useState<Error | null>(null);
  const save = useAction((b: Record<string, unknown>) => (rec ? api.patch(`/finance/recurring/${rec.id}`, b) : api.post('/finance/recurring', b)), onClose);
  const del = useAction(() => api.del(`/finance/recurring/${rec?.id}`), onClose);
  const discountNum = discount.trim() === '' ? 0 : Number(discount.replace(',', '.'));
  const netCents = (() => { const c = parseMoney(amount); return c && discountNum > 0 ? Math.round(c * (1 - discountNum / 100)) : null; })();
  return (
    <Modal title={rec ? 'Editar recorrência' : 'Nova recorrência ou assinatura'} onClose={onClose}
      onSubmit={() => { const c = parseMoney(amount); if (!c || c <= 0) return setErr(new Error('Informe um valor maior que zero.')); if (!accountId) return setErr(new Error('Escolha uma conta.')); if (discountNum < 0 || discountNum > 100) return setErr(new Error('O desconto precisa ficar entre 0% e 100%.')); setErr(null); save.mutate({ description, amountCents: c, kind, frequency, nextDue, accountId, categoryId: categoryId || null, isSubscription: sub, discountPct: discountNum > 0 ? discountNum : null, remindDaysBefore: remind === '' ? null : Number(remind) }); }}
      footer={<Footer busy={save.isPending} onDelete={rec ? async () => { if (await confirm('Excluir esta recorrência?')) del.mutate(undefined); } : undefined} />}>
      <Field label="Descrição"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Internet" required autoFocus /></Field>
      <div className="form-row">
        <Field label="Valor de tabela (R$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}><option value="expense">Despesa</option><option value="income">Receita</option></select></Field>
      </div>
      <Field label="Desconto (%) — opcional">
        <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Ex.: 10" />
        {netCents !== null && <small className="hint">Com desconto: <b>{brl(netCents)}</b> por {FREQ_LABEL[frequency]}.</small>}
      </Field>
      <div className="form-row">
        <Field label="Repete"><select value={frequency} onChange={(e) => setFrequency(e.target.value as FinRecurring['frequency'])}><option value="monthly">Todo mês</option><option value="weekly">Toda semana</option><option value="yearly">Todo ano</option></select></Field>
        <Field label="Próximo vencimento"><input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} required /></Field>
      </div>
      <div className="form-row">
        <Field label="Conta / cartão"><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{usable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Categoria"><CategorySelect categories={categories} kind={kind} value={categoryId} onChange={setCategoryId} /></Field>
      </div>
      <div className="form-row">
        <Field label="Avisar (dias antes)"><input type="number" min={0} max={30} value={remind} onChange={(e) => setRemind(e.target.value)} /></Field>
        <label className="check-line"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> É uma assinatura</label>
      </div>
      <ErrorText error={err ?? save.error ?? del.error} />
    </Modal>
  );
}
