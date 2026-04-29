function parseTasks(input) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Bitte mindestens eine Aufgabe eintragen.');
  }

  if (lines.length > 25) {
    throw new Error('Maximal 25 Aufgaben pro Challenge.');
  }

  return lines.map((line, index) => {
    const parts = line.split('|').map((part) => part.trim());

    if (parts.length < 2 || parts.length > 3) {
      throw new Error(`Zeile ${index + 1}: Format ist "Spiel | Anzahl | b2b".`);
    }

    const [name, countRaw, streakRaw = ''] = parts;
    const count = Number.parseInt(countRaw, 10);
    const streak = streakRaw.toLowerCase();

    if (!name) {
      throw new Error(`Zeile ${index + 1}: Spielname fehlt.`);
    }

    if (!Number.isInteger(count) || count < 1 || count > 999) {
      throw new Error(`Zeile ${index + 1}: Anzahl muss eine positive Zahl sein.`);
    }

    const streakNumber = streak ? Number.parseInt(streak.slice(1, -1), 10) : null;
    if (streak && (!/^b\d+b$/.test(streak) || !Number.isInteger(streakNumber) || streakNumber < 2)) {
      throw new Error(`Zeile ${index + 1}: Streak muss leer oder z.B. b2b/b3b sein.`);
    }

    return {
      id: `task_${index + 1}`,
      name,
      count,
      streak: streak || null
    };
  });
}

function formatTaskLabel(task) {
  const parts = [`${task.name} x${task.count}`];
  if (task.streak) parts.push(task.streak);
  return parts.join(' ');
}

function createTask({ index, title, count, b2b }) {
  const name = String(title || '').trim();
  const parsedCount = Number.parseInt(String(count || '').trim(), 10);

  if (!name) {
    throw new Error('Bitte einen Titel für die Aufgabe eintragen.');
  }

  if (name.length > 80) {
    throw new Error('Der Aufgabentitel darf maximal 80 Zeichen lang sein.');
  }

  if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 999) {
    throw new Error('Anzahl muss eine Zahl zwischen 1 und 999 sein.');
  }

  return {
    id: `task_${index + 1}`,
    name,
    count: parsedCount,
    streak: b2b ? 'b2b' : null
  };
}

module.exports = {
  parseTasks,
  formatTaskLabel,
  createTask
};
