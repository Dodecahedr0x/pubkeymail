'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers';
import { forwarding } from '@/lib/api';
import type { ForwardingRule } from '@/lib/api/forwarding';
import styles from './page.module.css';

export default function ForwardingPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<ForwardingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    const response = await forwarding.getForwardingRules();
    if (response.error) {
      setError(response.error.message);
    } else if (response.data) {
      setRules(response.data.rules);
    }
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setSubmitting(true);
    setError(null);

    const response = await forwarding.createForwardingRule({
      destinationEmail: newEmail.trim(),
    });

    if (response.error) {
      setError(response.error.message);
    } else if (response.data) {
      setRules([...rules, response.data.rule]);
      setNewEmail('');
    }
    setSubmitting(false);
  }

  async function handleToggle(rule: ForwardingRule) {
    const response = await forwarding.updateForwardingRule(rule.id, {
      enabled: !rule.enabled,
    });

    if (response.error) {
      setError(response.error.message);
    } else if (response.data) {
      setRules(rules.map((r) => (r.id === rule.id ? response.data!.rule : r)));
    }
  }

  async function handleDelete(id: number) {
    const response = await forwarding.deleteForwardingRule(id);

    if (response.error) {
      setError(response.error.message);
    } else {
      setRules(rules.filter((r) => r.id !== id));
    }
  }

  if (!user) return null;

  if (user.subscriptionTier !== 'paid') {
    return (
      <div className={styles.container}>
        <Link href="/settings" className={styles.backLink}>
          ← Back to Settings
        </Link>

        <div className={styles.upgrade}>
          <h2>↪️ Email Forwarding</h2>
          <p>Upgrade to Pro to automatically forward incoming emails to external addresses.</p>
          <Link href="/settings/upgrade" className="btn btn-primary">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/settings" className={styles.backLink}>
        ← Back to Settings
      </Link>

      <h1>Email Forwarding</h1>
      <p className={styles.description}>
        Automatically forward incoming emails to external addresses.
      </p>

      <section className={styles.section}>
        <h2>Add Forwarding Rule</h2>
        <div className={styles.card}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="destination">Destination Email</label>
              <input
                id="destination"
                type="email"
                placeholder="you@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Rule'}
            </button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Active Rules</h2>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : rules.length === 0 ? (
          <div className={styles.emptyState}>
            No forwarding rules configured. Add one above.
          </div>
        ) : (
          <div className={styles.rulesList}>
            {rules.map((rule) => (
              <div key={rule.id} className={styles.rule}>
                <span className={styles.ruleEmail}>{rule.destinationEmail}</span>
                <span
                  className={`${styles.status} ${
                    rule.verified ? styles.statusVerified : styles.statusPending
                  }`}
                >
                  {rule.verified ? '✓ Verified' : '⏳ Pending'}
                </span>
                <button
                  type="button"
                  className={`${styles.toggle} ${rule.enabled ? styles.active : ''}`}
                  onClick={() => handleToggle(rule)}
                  aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                />
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(rule.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
