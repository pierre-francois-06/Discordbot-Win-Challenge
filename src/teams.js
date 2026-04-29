function distributeRandomTeams(userIds, teamCount, rng = Math.random) {
  const uniqueUserIds = [...new Set(userIds)];

  if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 4) {
    throw new Error('Teamanzahl muss zwischen 1 und 4 liegen.');
  }

  if (uniqueUserIds.length < teamCount) {
    throw new Error('Für zufällige Teams brauchst du mindestens so viele Spieler wie Teams.');
  }

  const shuffled = [...uniqueUserIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const teams = Array.from({ length: teamCount }, () => ({ userIds: [] }));
  shuffled.forEach((userId, index) => {
    teams[index % teamCount].userIds.push(userId);
  });

  return teams;
}

module.exports = {
  distributeRandomTeams
};
