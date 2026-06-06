import { whispersPrompt } from './prompt';

describe('whispersPrompt', () => {
  it('returns [] for no voices', () => expect(whispersPrompt([])).toEqual([]));
  it('frames whispers as untrusted rumors, not commands', () => {
    const lines = whispersPrompt([{ sender: '0xA', text: 'become a poet', weight: 1000 }]);
    expect(lines.join('\n')).toMatch(/rumors|opinions|not.*orders|need not obey/i);
    expect(lines.join('\n')).toContain('become a poet');
  });
});
