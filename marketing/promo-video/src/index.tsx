import React from 'react';
import { AbsoluteFill, Audio, Composition, registerRoot, Sequence, staticFile } from 'remotion';
import { FONT, Punch } from './brand';
import { DemoScene } from './scenes/Demo';
import { FeaturesScene } from './scenes/Features';
import { NoiseScene } from './scenes/Noise';
import { OutroScene } from './scenes/Outro';
import { PrivacyScene } from './scenes/Privacy';
import { RevealScene } from './scenes/Reveal';
import { SpeedScene } from './scenes/Speed';
import { DURATION, FPS, SECTIONS } from './timing';

export const Promo: React.FC<{ withAudio?: boolean }> = ({ withAudio = true }) => (
  <AbsoluteFill style={{ fontFamily: FONT, background: '#f7f9f8', WebkitFontSmoothing: 'antialiased' }}>
    <Sequence from={SECTIONS.noise.from} durationInFrames={SECTIONS.noise.dur} name="Noise">
      <NoiseScene />
    </Sequence>
    <Sequence from={SECTIONS.reveal.from} durationInFrames={SECTIONS.reveal.dur} name="Reveal">
      <RevealScene />
    </Sequence>
    <Sequence from={SECTIONS.demo.from} durationInFrames={SECTIONS.demo.dur} name="Demo">
      <Punch>
        <DemoScene />
      </Punch>
    </Sequence>
    <Sequence from={SECTIONS.speed.from} durationInFrames={SECTIONS.speed.dur} name="Speed">
      <Punch>
        <SpeedScene />
      </Punch>
    </Sequence>
    <Sequence from={SECTIONS.privacy.from} durationInFrames={SECTIONS.privacy.dur} name="Privacy">
      <Punch>
        <PrivacyScene />
      </Punch>
    </Sequence>
    <Sequence from={SECTIONS.features.from} durationInFrames={SECTIONS.features.dur} name="Features">
      <Punch>
        <FeaturesScene />
      </Punch>
    </Sequence>
    <Sequence from={SECTIONS.outro.from} durationInFrames={SECTIONS.outro.dur} name="Outro">
      <OutroScene />
    </Sequence>
    {withAudio ? <Audio src={staticFile('music.wav')} /> : null}
  </AbsoluteFill>
);

const Root: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} defaultProps={{ withAudio: true }} />
  </>
);

registerRoot(Root);
