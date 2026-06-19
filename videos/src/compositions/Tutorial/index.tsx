import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
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
  ScaledBox,
  fitScale,
} from '@/components/primitives';
import {
  WalletButtonAdapter,
  SidebarAdapter,
  EmailListAdapter,
} from '@/components/adapters';
import { TutorialProps } from './schema';

export const Tutorial: React.FC<TutorialProps> = ({ steps = [] }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stepDuration = 120;

  // Area available for the visual highlight, below the step text and above the
  // progress bar. Highlights are scaled to fit this so they never collide with
  // the surrounding text.
  const availW = width * 0.82;
  const availH = height * 0.42;

  const renderHighlight = (highlight?: string, sequenceFrame = 0) => {
    switch (highlight) {
      case 'wallet': {
        const W = 480;
        const H = 170;
        const scale = fitScale(W, H, availW, availH, 2.2);
        return (
          <ScaledBox width={W} height={H} scale={scale}>
            <ElasticPop delay={35}>
              <PulsingGlow color="#9945FF" size={250}>
                <div
                  style={{
                    width: W,
                    height: H,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 50,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 30,
                    border: '3px solid rgba(20, 241, 149, 0.5)',
                    boxShadow: '0 0 60px rgba(20, 241, 149, 0.3)',
                  }}
                >
                  <WalletButtonAdapter delay={0} connected={false} />
                </div>
              </PulsingGlow>
            </ElasticPop>
          </ScaledBox>
        );
      }
      case 'inbox': {
        const W = 840;
        const H = 400;
        const scale = fitScale(W, H, availW, availH, 1.6);
        return (
          <ScaledBox width={W} height={H} scale={scale}>
            <div
              style={{
                display: 'flex',
                gap: 40,
                width: W,
                height: H,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SlideBlast delay={35} direction="left">
                <SidebarAdapter delay={0} activeItem="inbox" />
              </SlideBlast>
              <SlideBlast delay={45} direction="right">
                <EmailListAdapter delay={0} staggerDelay={5} />
              </SlideBlast>
            </div>
          </ScaledBox>
        );
      }
      case 'compose': {
        const W = 770;
        const H = 320;
        const scale = fitScale(W, H, availW, availH, 1.6);
        return (
          <ScaledBox width={W} height={H} scale={scale}>
          <SlideBlast delay={35} direction="up">
            <div
              style={{
                display: 'flex',
                gap: 40,
                width: W,
                height: H,
                alignItems: 'flex-start',
              }}
            >
              <SidebarAdapter delay={0} activeItem="compose" />
              <PulsingGlow color="#9945FF" size={200}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 20,
                    padding: 35,
                    width: 450,
                    border: '3px solid rgba(153, 69, 255, 0.5)',
                    boxShadow: '0 0 50px rgba(153, 69, 255, 0.3)',
                  }}
                >
                  <div
                    style={{
                      color: '#888',
                      marginBottom: 20,
                      fontSize: 18,
                      textTransform: 'uppercase',
                      letterSpacing: '2px',
                    }}
                  >
                    To:
                  </div>
                  <div
                    style={{
                      color: '#14F195',
                      marginBottom: 30,
                      fontSize: 24,
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    <TypeWriter text="alice.sol" startFrame={45} speed={3} />
                  </div>
                  <div
                    style={{
                      color: '#888',
                      marginBottom: 20,
                      fontSize: 18,
                      textTransform: 'uppercase',
                      letterSpacing: '2px',
                    }}
                  >
                    Message:
                  </div>
                  <div
                    style={{
                      color: 'white',
                      fontSize: 20,
                      lineHeight: 1.5,
                    }}
                  >
                    <TypeWriter
                      text="Hey! Sending this via PubKeyMail 🚀"
                      startFrame={65}
                      speed={1.5}
                    />
                  </div>
                </div>
              </PulsingGlow>
            </div>
          </SlideBlast>
          </ScaledBox>
        );
      }
      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatedGradient
        colors={['#0a1a0a', '#0a3a2a', '#1a4a3a', '#0a2a1a']}
        speed={0.3}
      >
        <FloatingParticles count={25} color="#14F195" seed="tutorial" />

        {steps.map((step, i) => (
          <Sequence
            key={i}
            from={i * stepDuration}
            durationInFrames={stepDuration}
          >
            <AbsoluteFill
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 35,
              }}
            >
              <ScreenFlash delay={0} color="#14F195" />

              {/* Step indicator - big and bold */}
              <ZoomBlur delay={3}>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #14F195, #0fa67a)',
                    color: '#0a0a0a',
                    padding: '16px 40px',
                    borderRadius: 40,
                    fontSize: Math.min(width * 0.025, 24),
                    fontWeight: 800,
                    boxShadow: '0 0 50px rgba(20, 241, 149, 0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '3px',
                  }}
                >
                  Step {i + 1} of {steps.length}
                </div>
              </ZoomBlur>

              {/* Title - swing in */}
              <SwingIn delay={12} direction={i % 2 === 0 ? 'left' : 'right'}>
                <h2
                  style={{
                    fontSize: Math.min(width * 0.06, 64),
                    fontWeight: 800,
                    color: 'white',
                    margin: 0,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '3px',
                  }}
                >
                  {step.title}
                </h2>
              </SwingIn>

              {/* Description - flip in */}
              <FlipIn delay={22} axis="x">
                <p
                  style={{
                    fontSize: Math.min(width * 0.028, 28),
                    color: '#bbb',
                    margin: 0,
                    maxWidth: width * 0.65,
                    textAlign: 'center',
                    lineHeight: 1.6,
                    fontWeight: 500,
                  }}
                >
                  {step.description}
                </p>
              </FlipIn>

              {/* Visual highlight */}
              <div style={{ marginTop: 20 }}>
                {renderHighlight(step.highlight)}
              </div>

              {/* Animated progress bar */}
              <div
                style={{
                  position: 'absolute',
                  bottom: height * 0.06,
                  left: width * 0.1,
                  right: width * 0.1,
                  height: 8,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <ElasticPop delay={50}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #14F195, #9945FF, #14F195)',
                      backgroundSize: '200% 100%',
                      width: `${((i + 1) / steps.length) * 100}%`,
                      borderRadius: 4,
                      boxShadow: '0 0 20px rgba(20, 241, 149, 0.5)',
                    }}
                  />
                </ElasticPop>
              </div>
            </AbsoluteFill>
          </Sequence>
        ))}
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
