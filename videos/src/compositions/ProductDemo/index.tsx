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
  ScaledBox,
  fitScale,
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

              {/* Connect prompt — hands off to the success state at frame 45 */}
              <Sequence durationInFrames={45} layout="none">
                <SlideBlast delay={5} direction="down">
                  <div style={{ textAlign: 'center' }}>
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
                      Connect &amp; Sign In
                    </h2>
                    <p
                      style={{
                        fontSize: Math.min(width * 0.024, 28),
                        color: '#14F195',
                        margin: '16px 0 0',
                        fontWeight: 600,
                        letterSpacing: '2px',
                      }}
                    >
                      No password. No signup.
                    </p>
                  </div>
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
              </Sequence>

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

                  <SlideBlast delay={28} direction="up">
                    <div
                      style={{
                        marginTop: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          color: '#888',
                          fontSize: Math.min(width * 0.018, 20),
                          textTransform: 'uppercase',
                          letterSpacing: '3px',
                        }}
                      >
                        Your inbox is live at
                      </span>
                      <span
                        style={{
                          color: '#fff',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: Math.min(width * 0.03, 36),
                          background: 'rgba(20, 241, 149, 0.15)',
                          border: '2px solid rgba(20, 241, 149, 0.6)',
                          borderRadius: 14,
                          padding: '12px 28px',
                        }}
                      >
                        Dode...7xKm@pubkeymail.com
                      </span>
                    </div>
                  </SlideBlast>
                </AbsoluteFill>
              </Sequence>
            </AbsoluteFill>
          </Sequence>
        )}

        {/* INBOX SEQUENCE */}
        {showInbox && (() => {
          const isPortrait = height > width;
          // Natural footprint of the sidebar + email-list group.
          const SIDEBAR_W = 280;
          const LIST_W = 520;
          const PANEL_H = 400;
          const gap = isPortrait ? 40 : 56;
          const contentW = isPortrait ? LIST_W : SIDEBAR_W + LIST_W + gap;
          const contentH = isPortrait ? 260 + gap + PANEL_H : PANEL_H;
          const scale = fitScale(
            contentW,
            contentH,
            width * 0.86,
            height * 0.84,
            1.7
          );

          return (
            <Sequence from={180} durationInFrames={120}>
              <AbsoluteFill
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ScreenFlash delay={0} color="#14F195" />

                <ScaledBox width={contentW} height={contentH} scale={scale}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: isPortrait ? 'column' : 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap,
                      width: contentW,
                      height: contentH,
                    }}
                  >
                    <SlideBlast delay={5} direction="left">
                      <SidebarAdapter delay={0} activeItem="inbox" />
                    </SlideBlast>

                    <SlideBlast delay={15} direction="right">
                      <EmailListAdapter delay={0} staggerDelay={6} />
                    </SlideBlast>
                  </div>
                </ScaledBox>
              </AbsoluteFill>
            </Sequence>
          );
        })()}
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
