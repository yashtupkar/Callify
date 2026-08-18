class TTSCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, buffer) {
    this.cache.set(key, buffer);
  }

  generateKey(provider, voiceId, text) {
    return `${provider}_${voiceId}_${text}`;
  }
}

const ttsCache = new TTSCache();
module.exports = { ttsCache };
