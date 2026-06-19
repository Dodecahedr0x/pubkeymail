import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import {
  AnimatedGradient,
  FloatingParticles,
  TypeWriter,
  ElasticPop,
  SlideBlast,
  ZoomBlur,
  ScreenFlash,
  SwingIn,
  PulsingGlow,
} from '@/components/primitives';
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
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatedGradient
        colors={['#0a0a1a', '#1a1a3e', '#2a0a4e', '#0a2a3e']}
        speed={0.5}
      >
        <FloatingParticles count={40} color="#14F195" seed="demo" />

        {/* TITLE SEQUENCE - Big dramatic entrance */}
        <Sequence from={0} durationInFrames={90}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScreenFlash delay={5} color="#14F195" />

            {/* Giant pulsing glow behind title */}
            <PulsingGlow color="#9945FF" size={Math.min(width, height) * 0.8}>
              <ZoomBlur delay={8}>
                <h1
                  style={{
                    fontSize: Math.min(width * 0.12, 180),
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #14F195 0%, #9945FF 50%, #14F195 100%)',
                    backgroundSize: '200% 200%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    letterSpacing: '-4px',
                    textShadow: '0 0 100px rgba(20, 241, 149, 0.5)',
                  }}
                >
                  {title}
                </h1>
              </ZoomBlur>
            </PulsingGlow>

            {/* Subtitle with swing animation */}
            <SwingIn delay={25} direction="right">
              <p
                style={{
                  fontSize: Math.min(width * 0.035, 48),
                  color: '#fff',
                  marginTop: 40,
                  letterSpacing: '4px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                <TypeWriter text={subtitle} startFrame={30} speed={1.5} />
              </p>
            </SwingIn>

            {/* Animated expanding lines */}
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                gap: 20,
                marginTop: height * 0.35,
              }}
            >
              {[0, 1, 2].map((i) => {
                const lineWidth = interpolate(
                  frame,
                  [50 + i * 5, 75 + i * 5],
                  [0, 150 - i * 30],
                  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );
                return (
                  <div
                    key={i}
                    style={{
                      height: 6,
                      width: lineWidth,
                      background: i === 1 ? '#14F195' : '#9945FF',
                      borderRadius: 3,
                    }}
                  />
                );
              })}
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* WALLET CONNECT SEQUENCE */}
        {showWalletConnect && (
          <Sequence from={90} durationInFrames={90}>
            <AbsoluteFill
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 50,
              }}
            >
              <ScreenFlash delay={0} color="#9945FF" />

              <SlideBlast delay={5} direction="down">
                <h2
                  style={{
                    fontSize: Math.min(width * 0.06, 72),
                    color: 'white',
                    margin: 0,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '6px',
                  }}
                >
                  Connect Your Wallet
                </h2>
              </SlideBlast>

              <ElasticPop delay={20}>
                <div
                  style={{
                    transform: 'scale(1.8)',
                    padding: 40,
                  }}
                >
                  <WalletButtonAdapter delay={0} connected={false} />
                </div>
              </ElasticPop>

              {/* Connection success */}
              <Sequence from={45}>
                <AbsoluteFill
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 40,
                  }}
                >
                  <ScreenFlash delay={0} color="#14F195" />

                  <ZoomBlur delay={3}>
                    <div
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #14F195, #0fa67a)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 60,
                        boxShadow: '0 0 80px rgba(20, 241, 149, 0.6)',
                      }}
                    >
                      ✓
                    </div>
                  </ZoomBlur>

                  <ElasticPop delay={15}>
                    <div style={{ transform: 'scale(1.5)' }}>
                      <WalletButtonAdapter
                        delay={0}
                        connected={true}
                        address="Dode...7xKm"
                      />
                    </div>
                  </ElasticPop>
                </AbsoluteFill>
              </Sequence>
            </AbsoluteFill>
          </Sequence>
        )}

        {/* INBOX SEQUENCE */}
        {showInbox && (
          <Sequence from={180} durationInFrames={120}>
            <AbsoluteFill
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 60,
                padding: 80,
              }}
            >
              <ScreenFlash delay={0} color="#14F195" />

              <SlideBlast delay={5} direction="left">
                <div style={{ transform: 'scale(1.3)' }}>
                  <SidebarAdapter delay={0} activeItem="inbox" />
                </div>
              </SlideBlast>

              <SlideBlast delay={15} direction="right">
                <div style={{ transform: 'scale(1.2)' }}>
                  <EmailListAdapter delay={0} staggerDelay={6} />
                </div>
              </SlideBlast>
            </AbsoluteFill>
          </Sequence>
        )}
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
