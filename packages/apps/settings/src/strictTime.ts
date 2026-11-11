/**
 * The time service, without the SDK's mock fallback.
 *
 * EchoClient answers from its mock when a native call throws, so on a
 * device a `setTimezone` the bridge refuses (a vela without the `time`
 * entry) would "succeed" while /etc/localtime stays as it was. Settings
 * must show that refusal, so on a device it calls the bridge itself and
 * lets the error through. With no bridge (the dev server) it uses the SDK,
 * whose mock is the only time service there is.
 */
import { echoClient, getClock, setTimezone, TIME_IFACE, type EchoClock, type TimezoneChange } from '@pyxis/app-sdk';

function bridge() {
  return typeof window !== 'undefined' && window.geckoOS?.initialized ? window.geckoOS : null;
}

/** Sets the zone; rejects with the bridge's or the service's reason. */
export async function setTimezoneStrict(timezone: string): Promise<TimezoneChange> {
  const geckoOS = bridge();
  if (!geckoOS || !echoClient.isNative()) return setTimezone(timezone);
  const res = (await geckoOS.callService('time', 'setTimezone', { timezone })) as
    | (Partial<TimezoneChange> & { error?: string })
    | undefined;
  if (typeof res?.timezone !== 'string' || typeof res.utc_offset_minutes !== 'number') {
    throw new Error(res?.error ?? `the time service gave no answer for ${timezone}`);
  }
  return { timezone: res.timezone, utc_offset_minutes: res.utc_offset_minutes };
}

/** What the time service says the clock is now; rejects if it can't be asked. */
export async function getClockStrict(): Promise<EchoClock> {
  const geckoOS = bridge();
  const res = geckoOS && echoClient.isNative() ? ((await geckoOS.callService('time', 'getClock', {})) as EchoClock | undefined) : await getClock();
  if (typeof res?.timezone !== 'string' || typeof res.utc_offset_minutes !== 'number') {
    throw new Error(`no answer from ${TIME_IFACE}`);
  }
  return res;
}
