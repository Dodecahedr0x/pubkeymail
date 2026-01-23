/**
 * Type declarations for @solana/spl-name-service
 * This package doesn't have compatible types for NodeNext module resolution
 */

declare module '@solana/spl-name-service' {
  import { Connection, PublicKey } from '@solana/web3.js';

  export function getHashedName(name: string): Promise<Buffer>;

  export function getNameAccountKey(
    hashedName: Buffer,
    nameClass?: PublicKey,
    parentName?: PublicKey
  ): Promise<PublicKey>;

  export class NameRegistryState {
    static retrieve(
      connection: Connection,
      nameAccountKey: PublicKey
    ): Promise<{ owner: PublicKey; class: PublicKey; parentName: PublicKey }>;

    owner: PublicKey;
    class: PublicKey;
    parentName: PublicKey;
  }
}
