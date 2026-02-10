/**
 * Timezone utilities for converting between local times and UTC.
 */

/**
 * Convert a local time in a specific IANA timezone to a UTC Date.
 *
 * Example: localTimeToUTC(new Date('2026-02-10'), '09:00', 'America/New_York')
 *          returns Date for 2026-02-10T14:00:00.000Z (EST = UTC-5)
 *
 * Handles DST correctly by computing the offset for the specific date.
 */
export function localTimeToUTC(
  date: Date,
  timeOfDay: string,
  timezone: string
): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number);

  // Build a rough UTC estimate using the target date + time as if they were UTC
  const rough = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0, 0)
  );

  // Use Intl to find what the local clock reads in the target timezone at this UTC moment
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(rough);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value);

  // Reconstruct what the local clock reads at `rough` UTC
  const localAtRough = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second')
  );

  // The offset is: local reading - UTC moment
  // e.g., for EST (UTC-5): if rough is 09:00 UTC, local reads 04:00, offset = -5h
  const offsetMs = localAtRough - rough.getTime();

  // To go from "user wants 09:00 local" to UTC: subtract the offset
  // If offset is -5h (EST), UTC = 09:00 - (-5h) = 14:00 UTC ✓
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0, 0) -
      offsetMs
  );
}
