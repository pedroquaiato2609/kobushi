// Criptografia de campos sensíveis em repouso (números de conta, tokens de integração), com uma chave do servidor.
import { decrypt, encrypt } from './crypto';

export class FieldCrypto {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('A chave de criptografia precisa ter 32 bytes.');
  }
  encrypt(plain: string) { return encrypt(this.key, plain); }
  decrypt(payload: string) { return decrypt(this.key, payload); }
}
