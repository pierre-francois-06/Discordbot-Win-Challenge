function formatDuration(ms) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parsePositiveMinutes(value) {
  const minutes = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
    throw new Error('Zeitlimit muss zwischen 1 Minute und 10080 Minuten liegen.');
  }
  return minutes;
}

module.exports = {
  formatDuration,
  parsePositiveMinutes
};
