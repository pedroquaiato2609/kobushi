// Cofre (senha + criptografia) e perfil do usuário em três níveis: geral, privado e secreto.
import { AppError, NotFoundError, ValidationError } from '../domain/errors';
import type { ProfileLevel } from '../domain/constants';
import type { Principle, PrincipleReminder, ProfileItem, StoredProfileItem } from '../domain/entities';
import { decrypt, deriveKey, encrypt, newSalt } from './crypto';
import type { PrincipleRepository, ProfileRepository, VaultRepository } from './ports';

const VERIFIER_TEXT = 'ninshiki-vault-v1';
const LOCKED_MESSAGE = 'O cofre está bloqueado. Peça ao usuário para desbloqueá-lo em Configurações > Perfil.';

export class VaultService {
  private key: Buffer | null = null;
  private until = 0;
  private failures = 0;
  private blockedUntil = 0;

  constructor(
    private repo: VaultRepository,
    private profile: ProfileRepository,
    private principles: PrincipleRepository,
    private opts: { ttlMs: number; now: () => number } = { ttlMs: 15 * 60_000, now: () => Date.now() },
  ) {}

  /** Chave atual, ou null se bloqueado/expirado. */
  currentKey(): Buffer | null {
    if (this.key && this.opts.now() > this.until) this.key = null;
    return this.key;
  }
  requireKey(): Buffer {
    const key = this.currentKey();
    if (!key) throw new AppError(LOCKED_MESSAGE, 423);
    return key;
  }

  async status() {
    const configured = Boolean(await this.repo.get());
    const key = this.currentKey();
    return { configured, unlocked: key !== null, unlockedUntil: key ? this.until : null };
  }

  async setup(password: string) {
    if (await this.repo.get()) throw new ValidationError('O cofre já foi configurado.');
    if (password.length < 8) throw new ValidationError('Use uma senha com pelo menos 8 caracteres.');
    const salt = newSalt();
    const key = deriveKey(password, salt);
    await this.repo.create(salt.toString('base64'), encrypt(key, VERIFIER_TEXT));
    this.open(key);
  }

  async unlock(password: string) {
    const now = this.opts.now();
    if (now < this.blockedUntil) throw new AppError(`Muitas tentativas. Tente de novo em ${Math.ceil((this.blockedUntil - now) / 1000)} s.`, 429);
    const vault = await this.repo.get();
    if (!vault) throw new ValidationError('O cofre ainda não foi configurado.');
    const key = deriveKey(password, Buffer.from(vault.salt, 'base64'));
    if (!this.verify(key, vault.verifier)) {
      if (++this.failures >= 5) { this.blockedUntil = now + 60_000; this.failures = 0; }
      throw new AppError('Senha incorreta.', 401);
    }
    this.failures = 0;
    this.open(key);
  }

  lock() { this.key = null; this.until = 0; }

  async change(current: string, next: string) {
    await this.unlock(current);
    if (next.length < 8) throw new ValidationError('Use uma senha com pelo menos 8 caracteres.');
    const oldKey = this.requireKey();
    const salt = newSalt();
    const newKey = deriveKey(next, salt);
    const profileItems = (await this.profile.list())
      .filter((i) => i.level === 'secret')
      .map((i) => ({ id: i.id, content: encrypt(newKey, decrypt(oldKey, i.content)) }));
    const principleItems = (await this.principles.listForRekey())
      .map((p) => ({ id: p.id, title: encrypt(newKey, decrypt(oldKey, p.title)), content: encrypt(newKey, decrypt(oldKey, p.content)) }));
    await this.repo.rekey(salt.toString('base64'), encrypt(newKey, VERIFIER_TEXT), profileItems, principleItems);
    this.open(newKey);
  }

  /** Esquecer a senha não tem recuperação: isto apaga o cofre, os itens secretos do perfil e todos os princípios. */
  async reset() { await this.repo.reset(); this.lock(); }

  private open(key: Buffer) { this.key = key; this.until = this.opts.now() + this.opts.ttlMs; }
  private verify(key: Buffer, verifier: string) {
    try { return decrypt(key, verifier) === VERIFIER_TEXT; } catch { return false; }
  }
}

export class ProfileService {
  constructor(private repo: ProfileRepository, private vault: VaultService) {}

  async list(): Promise<ProfileItem[]> {
    const key = this.vault.currentKey();
    return (await this.repo.list()).map((i) => this.view(i, key));
  }

  async create(input: { title: string; content: string; level: ProfileLevel }): Promise<ProfileItem> {
    const key = input.level === 'secret' ? this.vault.requireKey() : null;
    const row = await this.repo.create({ ...input, content: key ? encrypt(key, input.content) : input.content });
    return this.view(row, this.vault.currentKey());
  }

  async update(id: string, patch: { title?: string; content?: string; level?: ProfileLevel }): Promise<ProfileItem> {
    const current = await this.find(id);
    const level = patch.level ?? current.level;
    const needsKey = current.level === 'secret' || level === 'secret';
    const key = needsKey ? this.vault.requireKey() : null;
    // conteúdo em claro (decifra se preciso) e regrava conforme o nível final
    const plain = patch.content ?? (current.level === 'secret' ? decrypt(key!, current.content) : current.content);
    const stored = level === 'secret' ? encrypt(key!, plain) : plain;
    const row = await this.repo.update(id, { title: patch.title, level, content: stored });
    return this.view(row!, this.vault.currentKey());
  }

  async remove(id: string) {
    if (!(await this.repo.delete(id))) throw new NotFoundError('Informação');
  }

  /** O que o agente recebe sempre: itens gerais completos; dos demais, só o título. */
  async agentOverview() {
    const items = await this.repo.list();
    return {
      general: items.filter((i) => i.level === 'general').map((i) => ({ id: i.id, title: i.title, content: i.content })),
      protectedTitles: items.filter((i) => i.level !== 'general').map((i) => ({ id: i.id, title: i.title, level: i.level })),
    };
  }

  /** Leitura pelo agente de um item privado/secreto (a tool exige aprovação do usuário por padrão). */
  async readForAgent(id: string) {
    const item = await this.find(id);
    if (item.level === 'secret') return { id, title: item.title, level: item.level, content: decrypt(this.vault.requireKey(), item.content) };
    return { id, title: item.title, level: item.level, content: item.content };
  }

  /** O agente nunca cria nem altera itens secretos. */
  async saveForAgent(input: { id?: string; title: string; content: string; level: 'general' | 'private' }) {
    if (input.id) {
      const current = await this.find(input.id);
      if (current.level === 'secret') throw new AppError('Itens secretos só podem ser alterados pelo próprio usuário.', 403);
      return this.update(input.id, { title: input.title, content: input.content, level: input.level });
    }
    return this.create(input);
  }

  private async find(id: string): Promise<StoredProfileItem> {
    const item = await this.repo.get(id);
    if (!item) throw new NotFoundError('Informação');
    return item;
  }

  private view(i: StoredProfileItem, key: Buffer | null): ProfileItem {
    if (i.level !== 'secret') return { id: i.id, title: i.title, content: i.content, level: i.level, locked: false, updatedAt: i.updatedAt };
    let content: string | null = null;
    if (key) { try { content = decrypt(key, i.content); } catch { content = null; } }
    return { id: i.id, title: i.title, content, level: i.level, locked: content === null, updatedAt: i.updatedAt };
  }
}

/**
 * Princípios: frases pessoais protegidas pela mesma senha do Cofre. Título E conteúdo sempre cifrados —
 * com o cofre bloqueado, a lista não revela absolutamente nada além do id/pasta/data. Sem ferramenta de
 * agente nenhuma: é um espaço só do usuário, o assistente nunca lê nem escreve aqui.
 */
export class PrinciplesService {
  constructor(private repo: PrincipleRepository, private vault: VaultService) {}

  listFolders() { return this.repo.listFolders(); }
  createFolder(name: string) { return this.repo.createFolder(name); }
  async renameFolder(id: string, name: string) {
    const f = await this.repo.renameFolder(id, name);
    if (!f) throw new NotFoundError('Pasta');
    return f;
  }
  async removeFolder(id: string) { if (!(await this.repo.deleteFolder(id))) throw new NotFoundError('Pasta'); }

  async list(): Promise<Principle[]> {
    const key = this.vault.currentKey();
    return (await this.repo.list()).map((p) => this.view(p, key));
  }
  async get(id: string): Promise<Principle> {
    const p = await this.find(id);
    return this.view(p, this.vault.currentKey());
  }

  async create(input: { folderId: string | null; title: string; content: string }): Promise<Principle> {
    const key = this.vault.requireKey();
    const row = await this.repo.create({ folderId: input.folderId, title: encrypt(key, input.title), content: encrypt(key, input.content) });
    return this.view(row, key);
  }
  async update(id: string, patch: { folderId?: string | null; title?: string; content?: string }): Promise<Principle> {
    await this.find(id);
    const key = (patch.title !== undefined || patch.content !== undefined) ? this.vault.requireKey() : this.vault.currentKey();
    const row = await this.repo.update(id, {
      folderId: patch.folderId,
      ...(patch.title !== undefined ? { title: encrypt(key!, patch.title) } : {}),
      ...(patch.content !== undefined ? { content: encrypt(key!, patch.content) } : {}),
    });
    return this.view(row!, key);
  }
  async remove(id: string) { if (!(await this.repo.delete(id))) throw new NotFoundError('Princípio'); }

  async updateFolderReminder(id: string, patch: Partial<PrincipleReminder>) {
    const f = await this.repo.updateFolderReminder(id, patch);
    if (!f) throw new NotFoundError('Pasta');
    return f;
  }

  private async find(id: string) {
    const p = await this.repo.get(id);
    if (!p) throw new NotFoundError('Princípio');
    return p;
  }
  private view(p: { id: string; folderId: string | null; title: string; content: string; updatedAt: Date }, key: Buffer | null): Principle {
    if (!key) return { id: p.id, folderId: p.folderId, title: null, content: null, locked: true, updatedAt: p.updatedAt };
    try {
      return { id: p.id, folderId: p.folderId, title: decrypt(key, p.title), content: decrypt(key, p.content), locked: false, updatedAt: p.updatedAt };
    } catch {
      return { id: p.id, folderId: p.folderId, title: null, content: null, locked: true, updatedAt: p.updatedAt };
    }
  }
}
