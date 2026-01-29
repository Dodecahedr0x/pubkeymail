import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { GradientBackground, TextReveal, SlideIn } from '@/components/primitives';
import {
  WalletButtonAdapter,
  SidebarAdapter,
  EmailListAdapter,
} from '@/components/adapters';
import { ProductDemoProps } from './schema';

export const ProductDemo: React.FC<ProductDemoProps> = ({
  title = 'PubKeyMail',
  subtitle = 'Decentralized Email for Web3',
  showWalletConnect = true,
  showInbox = true,
}) => {
  const _frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <GradientBackground from="#0a0a1a" to="#1a1a3e">
        {/* Title sequence */}
        <Sequence from={0} durationInFrames={90}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlideIn direction="up" delay={10}>
              <h1
                style={{
                  fontSize: 80,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #14F195, #9945FF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                }}
              >
                {title}
              </h1>
            </SlideIn>
            <SlideIn direction="up" delay={25}>
              <p style={{ fontSize: 28, color: '#aaa', marginTop: 16 }}>
                <TextReveal text={subtitle} delay={35} charDelay={1} />
              </p>
            </SlideIn>
          </AbsoluteFill>
        </Sequence>

        {/* Wallet connect sequence */}
        {showWalletConnect && (
          <Sequence from={90} durationInFrames={90}>
            <AbsoluteFill
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 40,
              }}
            >
              <SlideIn direction="up" delay={0}>
                <h2 style={{ fontSize: 36, color: 'white', margin: 0 }}>
                  Connect Your Wallet
                </h2>
              </SlideIn>
              <WalletButtonAdapter delay={20} connected={false} />
              <Sequence from={45}>
                <WalletButtonAdapter
                  delay={0}
                  connected={true}
                  address="Dode...7xKm"
                />
              </Sequence>
            </AbsoluteFill>
          </Sequence>
        )}

        {/* Inbox sequence */}
        {showInbox && (
          <Sequence from={180} durationInFrames={120}>
            <AbsoluteFill
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 32,
                padding: 60,
              }}
            >
              <SidebarAdapter delay={0} activeItem="inbox" />
              <EmailListAdapter delay={15} staggerDelay={10} />
            </AbsoluteFill>
          </Sequence>
        )}
      </GradientBackground>
    </AbsoluteFill>
  );
};
