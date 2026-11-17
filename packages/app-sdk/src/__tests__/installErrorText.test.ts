import { afterEach, describe, expect, it, vi } from 'vitest';
import { echoClient, isPolicyRefusal } from '../EchoClient';
import { installErrorText } from '../useInstaller';

/** installer.rs refuses unsigned and tampered packages with a reason inside the error text. */
describe('installErrorText', () => {
  it('turns the installer service refusals into words', () => {
    expect(installErrorText('Method failed: {"reason":"unsigned","error":"x.ipk has no detached signature"}')).toContain(
      'not signed'
    );
    expect(installErrorText('{"reason":"bad-signature","error":"verify failed"}')).toContain('does not match');
  });

  it('turns the root-access dialog outcomes into words', () => {
    expect(installErrorText('{"reason":"denied","error":"Cancelled by the user"}')).toBe('Cancelled.');
    expect(installErrorText('Method failed: {"reason":"timeout","error":"no answer"}')).toBe(
      'No answer in time, so nothing was changed.'
    );
    expect(installErrorText('{"reason":"no-password","error":"no password set"}')).toBe(
      'Set a password in Settings → Users & Lock first.'
    );
  });

  it('leaves any other error as it was', () => {
    expect(installErrorText('opkg: dependency missing')).toBe('opkg: dependency missing');
  });
});


describe('a refusal from Echo is never answered by the mock', () => {
  const original = window.geckoOS;
  afterEach(() => {
    window.geckoOS = original;
    vi.restoreAllMocks();
  });

  it('recognises the held-action and signing reasons, and nothing else', () => {
    expect(isPolicyRefusal(new Error('Method failed: {"reason":"denied","error":"Cancelled"}'))).toBe(true);
    expect(isPolicyRefusal('{"reason":"unsigned","error":"x"}')).toBe(true);
    expect(isPolicyRefusal(new Error('Connection refused'))).toBe(false);
  });

  it('callMethod rethrows a dismissed install instead of returning the mock success', async () => {
    window.geckoOS = {
      initialized: true,
      callService: vi.fn().mockRejectedValue(new Error('{"reason":"denied","error":"Cancelled"}')),
    } as unknown as typeof window.geckoOS;
    await expect(
      echoClient.callMethod('installer', 'org.geckoOS.installer', 'Install', { packagePath: '/x.ipk' })
    ).rejects.toThrow('denied');
  });
});
