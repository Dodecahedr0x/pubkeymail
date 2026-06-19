import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  useVideoConfig,
  spring,
} from 'remotion';
import {
  AnimatedGradient,
  FloatingParticles,
  ElasticPop,
  SlideBlast,
  ZoomBlur,
  FlipIn,
  SwingIn,
  ScreenFlash,
  TypeWriter,
  PulsingGlow,
} from '@/components/primitives';
import { WalletButtonAdapter, SidebarAdapter, EmailListAdapter } from '@/components/adapters';
import { ProductPresentationProps } from './schema';

const FeatureScene: React.FC<{
  icon: string;
  title: string;
  description: string;
  visual: React.ReactNode;
  index: number;
}> = ({ icon, title, description, visual, index }) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30,
        padding: 60,
      }}
    >
      <ScreenFlash delay={0} color={index % 2 === 0 ? '#14F195' : '#9945FF'} />

      <ZoomBlur delay={5}>
        <div style={{ fontSize: Math.min(width * 0.1, 120) }}>{icon}</div>
      </ZoomBlur>

      <SwingIn delay={15} direction={index % 2 === 0 ? 'left' : 'right'}>
        <h2
          style={{
            fontSize: Math.min(width * 0.055, 64),
            fontWeight: 800,
            color: 'white',
            margin: 0,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '3px',
            textShadow: '0 0 40px rgba(153, 69, 255, 0.5)',
          }}
        >
          {title}
        </h2>
      </SwingIn>

      <FlipIn delay={25} axis="x">
        <p
          style={{
            fontSize: Math.min(width * 0.028, 32),
            color: '#ccc',
            margin: 0,
            maxWidth: width * 0.7,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </FlipIn>

      <ElasticPop delay={40}>
        <div style={{ marginTop: 20 }}>{visual}</div>
      </ElasticPop>
    </AbsoluteFill>
  );
};

export const ProductPresentation: React.FC<ProductPresentationProps> = ({ pricing }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const sceneDuration = 120;

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatedGradient
        colors={['#0a0a1a', '#1a1a3e', '#2a0a4e', '#0a2a3e']}
        speed={0.4}
      >
        <FloatingParticles count={35} color="#14F195" seed="product" />

        {/* INTRO - Title */}
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

            <PulsingGlow color="#9945FF" size={Math.min(width, height) * 0.8}>
              <ZoomBlur delay={8}>
                <h1
                  style={{
                    fontSize: Math.min(width * 0.14, 160),
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #14F195, #9945FF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    letterSpacing: '-4px',
                  }}
                >
                  PubKeyMail
                </h1>
              </ZoomBlur>
            </PulsingGlow>

            <SlideBlast delay={30} direction="up">
              <p
                style={{
                  fontSize: Math.min(width * 0.035, 42),
                  color: '#fff',
                  marginTop: 30,
                  letterSpacing: '6px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                <TypeWriter text="Your Wallet. Your Inbox." startFrame={35} speed={2} />
              </p>
            </SlideBlast>
          </AbsoluteFill>
        </Sequence>

        {/* FEATURE 1: Login with wallet */}
        <Sequence from={90} durationInFrames={sceneDuration}>
          <FeatureScene
            icon="🔐"
            title="Login With Your Wallet"
            description="No passwords, no email verification. Just connect your Solana wallet and you're in."
            index={0}
            visual={
              <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
                <div style={{ transform: 'scale(1.4)' }}>
                  <WalletButtonAdapter delay={0} connected={false} />
                </div>
                <Sequence from={50}>
                  <SlideBlast delay={0} direction="left">
                    <div
                      style={{
                        fontSize: 60,
                        filter: 'drop-shadow(0 0 20px rgba(20, 241, 149, 0.8))',
                      }}
                    >
                      →
                    </div>
                  </SlideBlast>
                </Sequence>
                <Sequence from={60}>
                  <div style={{ transform: 'scale(1.4)' }}>
                    <WalletButtonAdapter delay={0} connected={true} address="You.sol" />
                  </div>
                </Sequence>
              </div>
            }
          />
        </Sequence>

        {/* FEATURE 2: Multi-wallet inbox */}
        <Sequence from={210} durationInFrames={sceneDuration}>
          <FeatureScene
            icon="📬"
            title="All Your Keys, One Inbox"
            description="Connect multiple wallets. View all your emails in a unified, organized inbox."
            index={1}
            visual={
              <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transform: 'scale(0.9)',
                  }}
                >
                  {['main.sol', 'dao.sol', 'dev.sol'].map((wallet, i) => (
                    <SlideBlast key={wallet} delay={i * 10} direction="right">
                      <div
                        style={{
                          background: i === 0 ? '#14F195' : 'rgba(255,255,255,0.1)',
                          color: i === 0 ? '#0a0a0a' : '#fff',
                          padding: '12px 24px',
                          borderRadius: 12,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 18,
                        }}
                      >
                        {wallet}
                      </div>
                    </SlideBlast>
                  ))}
                </div>
                <div style={{ transform: 'scale(0.85)' }}>
                  <EmailListAdapter delay={30} staggerDelay={8} />
                </div>
              </div>
            }
          />
        </Sequence>

        {/* FEATURE 3: Mail forwarding */}
        <Sequence from={330} durationInFrames={sceneDuration}>
          <FeatureScene
            icon="↪️"
            title="Forward To Your Favorite Address"
            description="Never miss an important email. Redirect all messages to your existing inbox."
            index={2}
            visual={
              <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
                <FlipIn delay={0} axis="y">
                  <div
                    style={{
                      background: 'rgba(153, 69, 255, 0.2)',
                      border: '2px solid #9945FF',
                      borderRadius: 16,
                      padding: 25,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 40, marginBottom: 10 }}>📧</div>
                    <div style={{ color: '#14F195', fontFamily: 'monospace', fontSize: 18 }}>
                      you.sol@pubkeymail.com
                    </div>
                  </div>
                </FlipIn>
                <div
                  style={{
                    fontSize: 50,
                    color: '#14F195',
                    filter: 'drop-shadow(0 0 20px rgba(20, 241, 149, 0.8))',
                  }}
                >
                  ➜
                </div>
                <FlipIn delay={20} axis="y">
                  <div
                    style={{
                      background: 'rgba(20, 241, 149, 0.2)',
                      border: '2px solid #14F195',
                      borderRadius: 16,
                      padding: 25,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 40, marginBottom: 10 }}>📩</div>
                    <div style={{ color: '#fff', fontSize: 18 }}>your@gmail.com</div>
                  </div>
                </FlipIn>
              </div>
            }
          />
        </Sequence>

        {/* FEATURE 4: Privacy */}
        <Sequence from={450} durationInFrames={sceneDuration}>
          <FeatureScene
            icon="🛡️"
            title="Preserve Your Privacy"
            description="Reply using your pubkeymail.com address. Keep your personal email private."
            index={3}
            visual={
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  alignItems: 'center',
                }}
              >
                <SlideBlast delay={0} direction="left">
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 16,
                      padding: 20,
                      display: 'flex',
                      gap: 20,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 30 }}>👤</span>
                    <div>
                      <div style={{ color: '#888', fontSize: 14 }}>From:</div>
                      <div style={{ color: '#14F195', fontFamily: 'monospace', fontSize: 20 }}>
                        anon.sol@pubkeymail.com
                      </div>
                    </div>
                  </div>
                </SlideBlast>
                <SlideBlast delay={20} direction="right">
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 16,
                      padding: 20,
                      display: 'flex',
                      gap: 20,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 30 }}>🔒</span>
                    <div>
                      <div style={{ color: '#888', fontSize: 14 }}>Real identity:</div>
                      <div style={{ color: '#ff6b6b', fontSize: 20, textDecoration: 'line-through' }}>
                        hidden forever
                      </div>
                    </div>
                  </div>
                </SlideBlast>
              </div>
            }
          />
        </Sequence>

        {/* FEATURE 5: Encrypted emails */}
        <Sequence from={570} durationInFrames={sceneDuration}>
          <FeatureScene
            icon="🔒"
            title="End-to-End Encrypted"
            description="Send encrypted messages that only the recipient's wallet can decrypt."
            index={4}
            visual={
              <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                <FlipIn delay={0} axis="x">
                  <div
                    style={{
                      background: 'rgba(153, 69, 255, 0.2)',
                      border: '2px solid #9945FF',
                      borderRadius: 16,
                      padding: 25,
                      width: 200,
                    }}
                  >
                    <div style={{ color: '#fff', fontSize: 16, marginBottom: 10 }}>
                      Secret message...
                    </div>
                    <div style={{ color: '#14F195', fontSize: 14 }}>🔓 Readable</div>
                  </div>
                </FlipIn>
                <ZoomBlur delay={20}>
                  <div style={{ fontSize: 60 }}>🔐</div>
                </ZoomBlur>
                <FlipIn delay={30} axis="x">
                  <div
                    style={{
                      background: 'rgba(20, 241, 149, 0.1)',
                      border: '2px solid #14F195',
                      borderRadius: 16,
                      padding: 25,
                      width: 200,
                    }}
                  >
                    <div
                      style={{
                        color: '#666',
                        fontSize: 16,
                        marginBottom: 10,
                        fontFamily: 'monospace',
                      }}
                    >
                      x8Fk2#mL9...
                    </div>
                    <div style={{ color: '#ff6b6b', fontSize: 14 }}>🔒 Encrypted</div>
                  </div>
                </FlipIn>
              </div>
            }
          />
        </Sequence>

        {/* PRICING */}
        <Sequence from={690} durationInFrames={150}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 50,
            }}
          >
            <ScreenFlash delay={0} color="#14F195" />

            <ZoomBlur delay={5}>
              <h2
                style={{
                  fontSize: Math.min(width * 0.07, 80),
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '4px',
                }}
              >
                Simple Pricing
              </h2>
            </ZoomBlur>

            <div style={{ display: 'flex', gap: 40 }}>
              {/* Free tier */}
              <SlideBlast delay={20} direction="left">
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderRadius: 24,
                    padding: 40,
                    width: 300,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ color: '#888', fontSize: 20, marginBottom: 10 }}>
                    {pricing.free.name}
                  </div>
                  <div
                    style={{
                      fontSize: 60,
                      fontWeight: 800,
                      color: 'white',
                      marginBottom: 30,
                    }}
                  >
                    {pricing.free.price}
                  </div>
                  {pricing.free.features.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        color: '#aaa',
                        fontSize: 16,
                        padding: '10px 0',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              </SlideBlast>

              {/* Pro tier */}
              <SlideBlast delay={35} direction="right">
                <div
                  style={{
                    background: 'linear-gradient(180deg, rgba(153, 69, 255, 0.3) 0%, rgba(20, 241, 149, 0.1) 100%)',
                    border: '3px solid #14F195',
                    borderRadius: 24,
                    padding: 40,
                    width: 300,
                    textAlign: 'center',
                    boxShadow: '0 0 60px rgba(20, 241, 149, 0.3)',
                    transform: 'scale(1.05)',
                  }}
                >
                  <div
                    style={{
                      background: '#14F195',
                      color: '#0a0a0a',
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '6px 16px',
                      borderRadius: 20,
                      display: 'inline-block',
                      marginBottom: 15,
                    }}
                  >
                    RECOMMENDED
                  </div>
                  <div style={{ color: '#14F195', fontSize: 20, marginBottom: 10 }}>
                    {pricing.pro.name}
                  </div>
                  <div
                    style={{
                      fontSize: 60,
                      fontWeight: 800,
                      color: 'white',
                      marginBottom: 30,
                    }}
                  >
                    {pricing.pro.price}
                  </div>
                  {pricing.pro.features.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        color: '#ddd',
                        fontSize: 16,
                        padding: '10px 0',
                        borderTop: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      ✓ {f}
                    </div>
                  ))}
                </div>
              </SlideBlast>
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* CTA */}
        <Sequence from={840} durationInFrames={60}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 40,
            }}
          >
            <ScreenFlash delay={0} color="#9945FF" />

            <ElasticPop delay={10}>
              <h2
                style={{
                  fontSize: Math.min(width * 0.08, 90),
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #14F195, #9945FF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Get Started Free
              </h2>
            </ElasticPop>

            <SlideBlast delay={25} direction="up">
              <div
                style={{
                  fontSize: Math.min(width * 0.04, 48),
                  color: '#fff',
                  fontFamily: 'monospace',
                  background: 'rgba(20, 241, 149, 0.2)',
                  padding: '20px 50px',
                  borderRadius: 16,
                  border: '2px solid #14F195',
                }}
              >
                pubkeymail.com
              </div>
            </SlideBlast>
          </AbsoluteFill>
        </Sequence>
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
