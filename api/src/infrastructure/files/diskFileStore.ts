import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStore } from '../../application/library';

/** Guarda arquivos enviados em disco (volume Docker). Os nomes são UUIDs: nada do usuário vira caminho. */
export class DiskFileStore implements FileStore {
  private dir: string;
  constructor(dir: string) { this.dir = path.resolve(dir); }

  async save(name: string, data: Buffer) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(name), data);
  }
  async remove(name: string) { await rm(this.path(name), { force: true }); }
  path(name: string) {
    if (!/^[0-9a-f-]{36}$/i.test(name)) throw new Error('Nome de arquivo inválido.');
    return path.join(this.dir, name);
  }
}
