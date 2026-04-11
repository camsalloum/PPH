export const getTimezoneAbbreviation = (date, timezone) => {
  if (!timezone) return '';

  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      timeZoneName: 'short'
    }).formatToParts(date);
    const zonePart = parts.find((part) => part.type === 'timeZoneName');
    return zonePart ? zonePart.value : '';
  } catch (error) {
    return timezone;
  }
};

export const formatCompanyTime = (value, timezone, withZone = true) => {
  if (!value) return '-';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  try {
    const formatted = timezone
      ? date.toLocaleString(undefined, { timeZone: timezone })
      : date.toLocaleString();

    if (!withZone || !timezone) return formatted;

    const zone = getTimezoneAbbreviation(date, timezone);
    return zone ? `${formatted} ${zone}` : formatted;
  } catch (error) {
    return date.toLocaleString();
  }
};

export const getTimeZoneOptions = () => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch (error) {
    // Ignore and fallback below
  }

  return [
    'UTC',
    'Asia/Dubai',
    'Asia/Riyadh',
    'Asia/Qatar',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Africa/Cairo',
    'Asia/Kolkata',
    'Asia/Singapore'
  ];
};
