import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  useVideoConfig,
} from 'remotion';
import {
  AnimatedGradient,
  FloatingParticles,
  FloatingIcons,
  ElasticPop,
  SlideBlast,
  ZoomBlur,
  FlipIn,
  SwingIn,
  ScreenFlash,
  TypeWriter,
  PulsingGlow,
} from '@/components/primitives';
import { IntegratorPitchProps } from './schema';

const CodeBlock: React.FC<{ code: string; delay?: number }> = ({ code, delay = 0 }) => {
  const frame = useCurrentFrame();
  const lines = code.trim().split('\n');

  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 16,
        padding: 30,
        fontFamily: 'monospace',
        fontSize: 18,
        border: '2px solid rgba(20, 241, 149, 0.3)',
        boxShadow: '0 0 40px rgba(20, 241, 149, 0.2)',
      }}
    >
      {lines.map((line, i) => {
        const lineDelay = delay + i * 5;
        const opacity = interpolate(frame, [lineDelay, lineDelay + 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div key={i} style={{ opacity, marginBottom: 8 }}>
            <span style={{ color: '#666', marginRight: 20 }}>{i + 1}</span>
            <span
              style={{
                color: line.includes('//') ? '#666' : 
                       line.includes('await') ? '#9945FF' :
                       line.includes('"') ? '#14F195' : '#fff',
              }}
            >
              {line}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const BenefitCard: React.FC<{
  icon: string;
  title: string;
  description: string;
  delay: number;
  direction: 'left' | 'right' | 'up' | 'down';
  width?: number;
}> = ({ icon, title, description, delay, direction, width = 320 }) => {
  return (
    <SlideBlast delay={delay} direction={direction}>
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '2px solid rgba(153, 69, 255, 0.3)',
          borderRadius: 20,
          padding: 30,
          width,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 50, marginBottom: 15 }}>{icon}</div>
        <div
          style={{
            color: '#14F195',
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div style={{ color: '#aaa', fontSize: 16, lineHeight: 1.5 }}>{description}</div>
      </div>
    </SlideBlast>
  );
};

export const IntegratorPitch: React.FC<IntegratorPitchProps> = ({ companyName }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isPortrait = height > width;
  // Wider cards when stacked vertically so text stays readable on portrait.
  const cardWidth = isPortrait ? Math.min(width * 0.78, 640) : 320;

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatedGradient
        colors={['#0a0a1a', '#0a1a3e', '#1a0a3e', '#0a2a2e']}
        speed={0.3}
      >
        <FloatingIcons
          icons={['🔗', '📧', '🛡️', '🚀', '⚡', '💎']}
          seed="integrator"
        />

        {/* INTRO - The Problem */}
        <Sequence from={0} durationInFrames={120}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 40,
            }}
          >
            <ScreenFlash delay={5} color="#ff6b6b" />

            <SwingIn delay={10} direction="left">
              <h1
                style={{
                  fontSize: Math.min(width * 0.06, 70),
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                "Please enter your email"
              </h1>
            </SwingIn>

            <ElasticPop delay={30}>
              <div style={{ display: 'flex', gap: 30, marginTop: 20 }}>
                {['😩', '🙄', '👎'].map((emoji, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 80,
                      filter: 'drop-shadow(0 0 20px rgba(255, 107, 107, 0.5))',
                    }}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            </ElasticPop>

            <SlideBlast delay={50} direction="up">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 15,
                  alignItems: 'center',
                }}
              >
                {[
                  '❌ Users abandon onboarding',
                  '❌ Privacy-conscious users leave',
                  '❌ No way to reach them later',
                ].map((text, i) => (
                  <div
                    key={i}
                    style={{
                      color: '#ff6b6b',
                      fontSize: 24,
                      fontWeight: 600,
                    }}
                  >
                    {text}
                  </div>
                ))}
              </div>
            </SlideBlast>
          </AbsoluteFill>
        </Sequence>

        {/* SOLUTION - PubKeyMail */}
        <Sequence from={120} durationInFrames={100}>
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

            <ZoomBlur delay={5}>
              <h1
                style={{
                  fontSize: Math.min(width * 0.08, 90),
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #14F195, #9945FF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                }}
              >
                There's a Better Way
              </h1>
            </ZoomBlur>

            <FlipIn delay={25} axis="y">
              <PulsingGlow color="#14F195" size={300}>
                <div
                  style={{
                    background: 'rgba(20, 241, 149, 0.1)',
                    border: '3px solid #14F195',
                    borderRadius: 24,
                    padding: '30px 60px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 50, marginBottom: 15 }}>📧</div>
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 800,
                      color: 'white',
                    }}
                  >
                    PubKeyMail API
                  </div>
                  <div style={{ color: '#14F195', fontSize: 20, marginTop: 10 }}>
                    Every wallet already has an inbox.
                  </div>
                </div>
              </PulsingGlow>
            </FlipIn>
          </AbsoluteFill>
        </Sequence>

        {/* HOW IT WORKS - Code Example */}
        <Sequence from={220} durationInFrames={150}>
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

            <SwingIn delay={5} direction="right">
              <h2
                style={{
                  fontSize: Math.min(width * 0.05, 56),
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '3px',
                }}
              >
                Dead Simple Integration
              </h2>
            </SwingIn>

            <ElasticPop delay={20}>
              <CodeBlock
                delay={25}
                code={`// Send email to any wallet
await pubkeymail.send({
  to: "user-wallet-address",
  subject: "Welcome to ${companyName}!",
  body: "Thanks for joining..."
});

// That's it. No email collection needed.`}
              />
            </ElasticPop>

            <SlideBlast delay={80} direction="up">
              <div
                style={{
                  color: '#14F195',
                  fontSize: 28,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 15,
                }}
              >
                <span style={{ fontSize: 40 }}>⚡</span>
                3 lines of code. Zero friction.
              </div>
            </SlideBlast>
          </AbsoluteFill>
        </Sequence>

        {/* BENEFITS */}
        <Sequence from={370} durationInFrames={150}>
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
                  fontSize: Math.min(width * 0.055, 64),
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '3px',
                }}
              >
                Why Integrate?
              </h2>
            </ZoomBlur>

            <div
              style={{
                display: 'flex',
                flexDirection: isPortrait ? 'column' : 'row',
                gap: 30,
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <BenefitCard
                icon="🛡️"
                title="Protect Privacy"
                description="Users keep their personal email private. Build trust from day one."
                delay={20}
                direction="left"
                width={cardWidth}
              />
              <BenefitCard
                icon="🚀"
                title="Faster Onboarding"
                description="No email forms. No verification. Users connect wallet and go."
                delay={35}
                direction="up"
                width={cardWidth}
              />
              <BenefitCard
                icon="📈"
                title="Better Ops"
                description="Reach users anytime. Transaction alerts, updates, announcements."
                delay={50}
                direction="right"
                width={cardWidth}
              />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* USE CASES */}
        <Sequence from={520} durationInFrames={130}>
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

            <SwingIn delay={5} direction="left">
              <h2
                style={{
                  fontSize: Math.min(width * 0.05, 56),
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                }}
              >
                Perfect For
              </h2>
            </SwingIn>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 25,
                justifyContent: 'center',
                maxWidth: width * 0.8,
              }}
            >
              {[
                { icon: '🎮', label: 'Gaming' },
                { icon: '💰', label: 'DeFi' },
                { icon: '🖼️', label: 'NFT Platforms' },
                { icon: '🏛️', label: 'DAOs' },
                { icon: '🛒', label: 'Marketplaces' },
                { icon: '💼', label: 'Enterprise' },
              ].map((item, i) => (
                <ElasticPop key={item.label} delay={20 + i * 10}>
                  <div
                    style={{
                      background:
                        i % 2 === 0
                          ? 'linear-gradient(135deg, rgba(20, 241, 149, 0.2), rgba(20, 241, 149, 0.05))'
                          : 'linear-gradient(135deg, rgba(153, 69, 255, 0.2), rgba(153, 69, 255, 0.05))',
                      border: `2px solid ${i % 2 === 0 ? '#14F195' : '#9945FF'}`,
                      borderRadius: 16,
                      padding: '20px 35px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 45, marginBottom: 10 }}>{item.icon}</div>
                    <div style={{ color: 'white', fontSize: 18, fontWeight: 600 }}>
                      {item.label}
                    </div>
                  </div>
                </ElasticPop>
              ))}
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* CTA */}
        <Sequence from={650} durationInFrames={90}>
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

            <PulsingGlow color="#9945FF" size={Math.min(width, height) * 0.7}>
              <ZoomBlur delay={5}>
                <h1
                  style={{
                    fontSize: Math.min(width * 0.07, 80),
                    fontWeight: 900,
                    color: 'white',
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  Start Building Today
                </h1>
              </ZoomBlur>
            </PulsingGlow>

            <ElasticPop delay={25}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #14F195, #0fa67a)',
                  color: '#0a0a0a',
                  fontSize: 28,
                  fontWeight: 800,
                  padding: '25px 60px',
                  borderRadius: 20,
                  boxShadow: '0 0 60px rgba(20, 241, 149, 0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '3px',
                }}
              >
                docs.pubkeymail.com
              </div>
            </ElasticPop>

            <SlideBlast delay={45} direction="up">
              <div style={{ color: '#888', fontSize: 22 }}>
                Free tier • No credit card • Ship in minutes
              </div>
            </SlideBlast>
          </AbsoluteFill>
        </Sequence>
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
