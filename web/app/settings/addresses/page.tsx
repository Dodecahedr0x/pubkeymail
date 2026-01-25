'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import bs58 from 'bs58';
import { useAuth } from '@/providers';
import * as usersApi from '@/lib/api/users';
import * as authApi from '@/lib/api/auth';
import styles from './page.module.css';

interface LinkedAddress {
  id?: number;
  address: string;
  blockchain: string;
  verifiedAt: string;
}

export default function AddressesPage() {
  const { user } = useAuth();
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [addresses, setAddresses] = useState<LinkedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkStep, setLinkStep] = useState<'idle' | 'wallet-connected' | 'signing'>('idle');

  useEffect(() => {
    if (user?.linkedAddresses) {
      setAddresses(user.linkedAddresses);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (connected && publicKey && linkStep === 'idle' && !linking) {
      const connectedAddress = publicKey.toBase58();
      const isAlreadyLinked = 
        connectedAddress === user?.primaryAddress ||
        addresses.some(a => a.address === connectedAddress);
      
      if (!isAlreadyLinked) {
        setLinkStep('wallet-connected');
      }
    }
  }, [connected, publicKey, user, addresses, linkStep, linking]);

  async function handleLinkNewAddress() {
    setError(null);
    setVisible(true);
  }

  async function handleConfirmLink() {
    if (!publicKey || !signMessage || !user) {
      setError('Wallet not properly connected');
      return;
    }

    setLinking(true);
    setLinkStep('signing');
    setError(null);

    try {
      const newAddress = publicKey.toBase58();

      const challengeResult = await authApi.requestChallenge(newAddress);
      if (challengeResult.error) {
        throw new Error(challengeResult.error.message);
      }

      const { challenge } = challengeResult.data!;
      const messageBytes = new TextEncoder().encode(challenge);
      const signatureBytes = await signMessage(messageBytes);
      const _signature = bs58.encode(signatureBytes);

      const result = await usersApi.linkAddress(user.id, newAddress, 'solana');
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      if (result.data?.linkedAddress) {
        setAddresses([...addresses, {
          id: result.data.linkedAddress.id,
          address: result.data.linkedAddress.address,
          blockchain: result.data.linkedAddress.blockchain,
          verifiedAt: result.data.linkedAddress.verifiedAt,
        }]);
      }

      disconnect();
      setLinkStep('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link address');
      setLinkStep('idle');
    } finally {
      setLinking(false);
    }
  }

  async function handleCancelLink() {
    disconnect();
    setLinkStep('idle');
    setError(null);
  }

  async function handleUnlink(address: LinkedAddress) {
    if (!user || !address.id) return;
    
    setError(null);

    const result = await usersApi.unlinkAddress(user.id, address.id);
    
    if (result.error) {
      setError(result.error.message);
    } else {
      setAddresses(addresses.filter(a => a.address !== address.address));
    }
  }

  function formatAddress(addr: string) {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  if (!user) return null;

  const isPaidUser = user.subscriptionTier === 'paid';
  const maxAddresses = isPaidUser ? 10 : 1;
  const canAddMore = addresses.length < maxAddresses;

  return (
    <div className={styles.container}>
      <Link href="/settings" className={styles.backLink}>
        ← Back to Settings
      </Link>

      <h1>Linked Addresses</h1>
      <p className={styles.description}>
        Link multiple wallet addresses to receive emails from all of them in one mailbox.
        {!isPaidUser && ' Upgrade to Pro to link up to 10 addresses.'}
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.section}>
        <h2>Primary Address</h2>
        <div className={styles.addressCard}>
          <div className={styles.addressInfo}>
            <span className={styles.addressIcon}>👛</span>
            <div className={styles.addressDetails}>
              <code className={styles.address}>{user.primaryAddress}</code>
              <span className={styles.blockchain}>{user.blockchain}</span>
            </div>
          </div>
          <span className={styles.primaryBadge}>Primary</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Linked Addresses ({addresses.length}/{maxAddresses})</h2>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : addresses.length === 0 ? (
          <div className={styles.emptyState}>
            No linked addresses yet. Add one below.
          </div>
        ) : (
          <div className={styles.addressList}>
            {addresses.map((addr) => (
              <div key={addr.address} className={styles.addressCard}>
                <div className={styles.addressInfo}>
                  <span className={styles.addressIcon}>🔗</span>
                  <div className={styles.addressDetails}>
                    <code className={styles.address} title={addr.address}>
                      {formatAddress(addr.address)}
                    </code>
                    <span className={styles.blockchain}>{addr.blockchain}</span>
                  </div>
                </div>
                <span className={styles.verifiedDate}>
                  Linked {new Date(addr.verifiedAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className={styles.unlinkBtn}
                  onClick={() => handleUnlink(addr)}
                >
                  Unlink
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2>Link New Address</h2>
        <div className={styles.card}>
          {!canAddMore ? (
            <div className={styles.limitReached}>
              <p>You&apos;ve reached the maximum number of linked addresses for your plan.</p>
              {!isPaidUser && (
                <Link href="/settings/upgrade" className="btn btn-primary">
                  Upgrade to Pro
                </Link>
              )}
            </div>
          ) : linkStep === 'wallet-connected' ? (
            <div className={styles.confirmLink}>
              <p>
                Ready to link: <code>{publicKey?.toBase58()}</code>
              </p>
              <p className={styles.signNote}>
                You&apos;ll need to sign a message to verify ownership.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmLink}
                  disabled={linking}
                >
                  {linking ? 'Signing...' : 'Sign & Link'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelLink}
                  disabled={linking}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : linkStep === 'signing' ? (
            <div className={styles.signingState}>
              <p>Please sign the message in your wallet...</p>
            </div>
          ) : (
            <div className={styles.addAddress}>
              <p>Connect a different wallet to link it to your account.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleLinkNewAddress}
              >
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
