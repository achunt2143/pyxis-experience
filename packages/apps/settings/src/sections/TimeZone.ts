import { view } from '@duyojs/duyo';
import { listTimezones, type ClockState, type TimeZoneEntry } from '@pyxis/app-sdk';
import { bindClock, onDestroy } from '@pyxis/app-sdk/duyo';
import { present } from '../parts/present';
import { recall, remember, watchRemembered } from '../remember';
import { getClockStrict, setTimezoneStrict } from '../strictTime';
import { formatOffset, searchZones, zoneDetail, zoneOption, type ZoneOption } from '../timezones';
import '../islands';
import spec from './TimeZone.view.json';
import type { CodeBehind } from './TimeZone.view.gen';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Remembered beyond this kind (remember.ts): what the user was just told, and that a change is
// in flight, outlive the section being closed and opened again while the time service answers.
const PENDING = 'timezone.pending';
const STATUS = 'timezone.status';
const ERROR = 'timezone.error';

/**
 * The Time zone groupbox: the current zone, a search box and the list (an island: it has
 * hundreds of rows). Choosing a zone goes to the time service through strictTime.ts, so a
 * refusal (a vela without the `time` bridge entry) is shown, never swallowed, and the clock is
 * read back to confirm it took.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._options = [] as ZoneOption[];
    bindClock(this, 'clock');

    const readRemembered = () => {
      this.setPending(recall<string | null>(PENDING, null));
      this.setStatus(recall<string | null>(STATUS, null) ?? '');
      this.setFailure(recall<string | null>(ERROR, null) ?? '');
    };
    readRemembered();
    onDestroy(this, watchRemembered(() => !this.destroyed && readRemembered()));

    void listTimezones().then((list) => {
      if (this.destroyed) return;
      // Offsets are read when the list arrives; a label is fine a minute stale.
      const at = Date.now();
      this._options = list.map((e: TimeZoneEntry) => zoneOption(e, at));
      this.setEntries(list);
    });
    this.draw();
  },

  clockChanged() {
    this.draw();
  },
  entriesChanged() {
    this.draw();
  },
  queryChanged() {
    this.draw();
  },
  pendingChanged() {
    this.draw();
  },
  statusChanged() {
    this.draw();
  },
  failureChanged() {
    this.draw();
  },

  searched(_sender, event) {
    this.setQuery(String(event['value'] ?? ''));
    return true;
  },

  async chosen(_sender, event) {
    const id = event['id'] as string;
    const option = (this._options as ZoneOption[]).find((o) => o.id === id);
    if (!option || recall<string | null>(PENDING, null)) return true;
    remember<string | null>(PENDING, option.id);
    remember<string | null>(STATUS, null);
    remember<string | null>(ERROR, null);
    try {
      await setTimezoneStrict(option.id);
    } catch (err) {
      remember(ERROR, `Couldn't set the time zone to ${option.city}: ${message(err)}`);
      remember<string | null>(PENDING, null);
      return true;
    }
    try {
      const confirmed = await getClockStrict();
      if (confirmed.timezone === option.id) {
        remember(STATUS, `Time zone set to ${option.city} (${formatOffset(confirmed.utc_offset_minutes)}).`);
      } else {
        remember(ERROR, `The time service didn't take the change: it still reports ${confirmed.timezone}.`);
      }
    } catch (err) {
      remember(ERROR, `The time zone was sent, but the clock couldn't be read back to confirm it: ${message(err)}`);
    } finally {
      remember<string | null>(PENDING, null);
    }
    return true;
  },

  draw() {
    const clock = this.clock as ClockState | null;
    const entries = this.entries as TimeZoneEntry[] | null;
    const query = this.query as string;
    const currentZone = clock?.timezone ?? 'UTC';
    const options = this._options as ZoneOption[];
    const { current, city, detail, list, statusLine, errorLine } = this.$;

    const now = options.find((o) => o.id === currentZone) ?? zoneOption({ id: currentZone, countries: [] }, Date.now());
    current.setAttributes({ 'data-timezone-current': now.id });
    city.setContent(now.city);
    detail.setContent(`${zoneDetail(now) || now.offsetText} · ${now.id}`);

    list.setCurrentZone(currentZone);
    list.setPending(this.pending);
    list.setLoading(entries === null);
    list.setGrouped(!query.trim());
    list.setEmptyText(
      entries && entries.length === 0 ? 'The time service listed no time zones.' : `No time zone matches “${query}”.`
    );
    // Searching ~400 zones is cheap, but the island only redraws when `results` is a new array.
    const cache = this._results as { options: ZoneOption[]; query: string; results: ZoneOption[] } | undefined;
    if (!cache || cache.options !== options || cache.query !== query) {
      this._results = { options, query, results: searchZones(options, query) };
    }
    list.setResults((this._results as { results: ZoneOption[] }).results);

    statusLine.setContent(this.status);
    present(statusLine, this.status !== '', { role: 'status', 'data-timezone-status': true });
    errorLine.setContent(this.failure);
    present(errorLine, this.failure !== '', { role: 'alert', 'data-timezone-error': true });
  },
} satisfies CodeBehind);
