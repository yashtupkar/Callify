const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TTSCache {
  constructor() {
    this.cacheDir = path.join(__dirname, '../../../../cache/tts');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  get(key) {
    const filePath = path.join(this.cacheDir, `${key}.raw`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return null;
  }

  set(key, buffer) {
    const filePath = path.join(this.cacheDir, `${key}.raw`);
    fs.writeFileSync(filePath, buffer);
  }

  generateKey(provider, voiceId, text) {
    const hash = crypto.createHash('md5').update(`${provider}_${voiceId}_${text}`).digest('hex');
    return `greeting_${hash}`;
  }
}

const ttsCache = new TTSCache();
module.exports = { ttsCache };
