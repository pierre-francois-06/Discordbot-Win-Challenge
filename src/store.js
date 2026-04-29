const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STORE_PATH = path.join(process.cwd(), 'data', 'challenges.json');

function createStore(filePath = DEFAULT_STORE_PATH) {
  function read() {
    if (!fs.existsSync(filePath)) {
      return { activeChallenges: {} };
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return { activeChallenges: {} };
    return JSON.parse(raw);
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  function saveChallenge(state) {
    const data = read();
    data.activeChallenges[state.id] = state;
    write(data);
    return state;
  }

  function deleteChallenge(challengeId) {
    const data = read();
    delete data.activeChallenges[challengeId];
    write(data);
  }

  function getChallenge(challengeId) {
    return read().activeChallenges[challengeId] || null;
  }

  function getChallengeByMessageId(messageId) {
    return listChallenges().find((challenge) => challenge.messageId === messageId) || null;
  }

  function getActiveChallengeByChannelId(channelId) {
    return listChallenges().find((challenge) => challenge.channelId === channelId && challenge.status === 'active') || null;
  }

  function listChallenges() {
    return Object.values(read().activeChallenges);
  }

  return {
    filePath,
    read,
    write,
    saveChallenge,
    deleteChallenge,
    getChallenge,
    getChallengeByMessageId,
    getActiveChallengeByChannelId,
    listChallenges
  };
}

module.exports = {
  DEFAULT_STORE_PATH,
  createStore
};
