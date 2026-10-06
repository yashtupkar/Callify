/**
 * BaileysProvider
 *
 * WhatsApp provider implementation using the Baileys library (WhatsApp Web API).
 * This provides free WhatsApp connectivity for hackathon demos.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { WhatsAppProvider } = require('./WhatsAppProvider');

class BaileysProvider extends WhatsAppProvider {
  constructor(config) {
    super(config);
    this.socket = null;
    this.authPath = config.authPath || './baileys_auth';
    this.instanceId = config.instanceId;
    this.connectionStatus = 'disconnected';
    this.qrCode = null;
    this.phoneNumber = null;
    
    // Event callbacks
    this.onQR = config.onQR || (() => {});
    this.onConnectionUpdate = config.onConnectionUpdate || (() => {});
    this.onMessage = config.onMessage || (() => {});
    
    this.initialize();
  }

  async initialize() {
    try {
      // Ensure auth directory exists
      if (!fs.existsSync(this.authPath)) {
        fs.mkdirSync(this.authPath, { recursive: true });
      }

      const authPath = path.join(this.authPath, this.instanceId);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      const logger = pino({ level: 'silent' });

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['Callify', 'Chrome', '1.0.0'],
      });

      // Store credentials update handler
      this.saveCreds = saveCreds;

      // Listen for connection updates
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.connectionStatus = 'scan_qr';
          this.onQR(qr);
          this.onConnectionUpdate({ status: 'scan_qr', qr });
        }

        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          this.connectionStatus = 'disconnected';
          this.onConnectionUpdate({ status: 'disconnected', shouldReconnect });

          if (shouldReconnect) {
            console.log(`[BaileysProvider] Connection closed, reconnecting...`);
            setTimeout(() => this.initialize(), 5000);
          } else {
            console.log(`[BaileysProvider] Connection closed permanently (logged out)`);
            // Clean up auth files
            this.cleanupAuth();
          }
        }

        if (connection === 'open') {
          this.connectionStatus = 'connected';
          this.phoneNumber = this.socket.user.id.split(':')[0];
          this.onConnectionUpdate({ status: 'connected', phoneNumber: this.phoneNumber });
          console.log(`[BaileysProvider] Connected as ${this.phoneNumber}`);
        }
      });

      // Listen for credentials updates
      this.socket.ev.on('creds.update', saveCreds);

      // Listen for incoming messages
      this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
          for (const msg of messages) {
            // Let the parseMessage handle fromMe for polls
            const normalized = this.parseMessage(msg);
            if (normalized) {
              await this.onMessage(normalized);
            }
          }
        }
      });

    } catch (error) {
      console.error('[BaileysProvider] Initialization error:', error);
      this.connectionStatus = 'error';
      this.onConnectionUpdate({ status: 'error', error: error.message });
    }
  }

  parseMessage(msg) {
    try {
      const message = msg.message;
      if (!message) return null;

      const from = msg.key.remoteJid;
      
      // Only process direct messages. Ignore groups, status updates, and system messages.
      if (!from.endsWith('@s.whatsapp.net') && !from.endsWith('@lid')) {
        return null;
      }

      // Ignore our own messages unless it's a poll update (users vote on our polls)
      if (msg.key.fromMe && !message.pollUpdateMessage) {
        return null;
      }

      const timestamp = msg.messageTimestamp;
      const providerMessageId = msg.key.id;

      // Poll votes
      if (message.pollUpdateMessage) {
        const pollCreationMessageKey = message.pollUpdateMessage.pollCreationMessageKey;
        const originalMsg = this.pollCache?.get(pollCreationMessageKey.id);
        
        if (originalMsg) {
          try {
            const { decryptPollVote } = require('@whiskeysockets/baileys');
            const crypto = require('crypto');
            
            const pollEncKey = originalMsg.message?.messageContextInfo?.messageSecret;
            const decrypted = decryptPollVote(message.pollUpdateMessage.vote, {
              pollCreatorJid: originalMsg.key.fromMe ? `${this.phoneNumber}@s.whatsapp.net` : from,
              pollMsgId: pollCreationMessageKey.id,
              pollEncKey,
              voterJid: msg.key.remoteJid
            });
            
            const options = originalMsg.message?.pollCreationMessage?.options || [];
            let selectedText = null;
            
            for (const opt of options) {
              const hash = crypto.createHash('sha256').update(opt.optionName).digest();
              if (decrypted.selectedOptions.some(sel => sel.equals(hash))) {
                selectedText = opt.optionName;
                break;
              }
            }
            
            if (selectedText) {
              return {
                providerMessageId,
                jid: from,
                from: from.split('@')[0],
                timestamp,
                type: 'text',
                text: selectedText
              };
            }
          } catch (e) {
            console.error('[BaileysProvider] Error decrypting poll vote:', e);
          }
        }
        return null;
      }

      // Text message
      if (message.conversation) {
        return {
          providerMessageId,
          jid: from,
          from: from.split('@')[0],
          timestamp,
          type: 'text',
          text: message.conversation
        };
      }

      // Extended text
      if (message.extendedTextMessage?.text) {
        return {
          providerMessageId,
          jid: from,
          from: from.split('@')[0],
          timestamp,
          type: 'text',
          text: message.extendedTextMessage.text
        };
      }

      // Poll votes
      if (message.pollUpdateMessage) {
        console.log('[BaileysProvider] Received pollUpdateMessage');
        const pollCreationMessageKey = message.pollUpdateMessage.pollCreationMessageKey;
        const originalMsg = this.pollCache?.get(pollCreationMessageKey.id);
        
        if (!originalMsg) {
          console.log('[BaileysProvider] Poll creation message not found in cache for ID:', pollCreationMessageKey.id);
          return null;
        }

        try {
          const { getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');
          const votes = getAggregateVotesInPollMessage({
            message: originalMsg.message,
            pollUpdates: [msg]
          });
          console.log('[BaileysProvider] Decrypted votes:', votes);
          const selected = votes.find(v => v.voters.length > 0)?.name;
          if (selected) {
            console.log('[BaileysProvider] User selected:', selected);
            return {
              providerMessageId,
              jid: from,
              from: from.split('@')[0],
              timestamp,
              type: 'text',
              text: selected
            };
          }
        } catch (e) {
          console.error('[BaileysProvider] Error parsing poll vote:', e);
        }
        return null;
      }

      // Location message
      if (message.locationMessage || message.liveLocationMessage) {
        const locMsg = message.locationMessage || message.liveLocationMessage;
        return {
          providerMessageId,
          jid: from,
          from: from.split('@')[0],
          timestamp,
          type: 'location',
          location: {
            lat: locMsg.degreesLatitude,
            lng: locMsg.degreesLongitude
          }
        };
      }

      // Image message
      if (message.imageMessage) {
        return {
          providerMessageId,
          from: from.split('@')[0],
          timestamp,
          type: 'image',
          media: {
            url: message.imageMessage.url,
            mime: message.imageMessage.mimetype,
            providerMediaId: message.imageMessage.url,
            caption: message.imageMessage.caption
          }
        };
      }

      // Document message
      if (message.documentMessage) {
        return {
          providerMessageId,
          from: from.split('@')[0],
          timestamp,
          type: 'document',
          media: {
            url: message.documentMessage.url,
            mime: message.documentMessage.mimetype,
            providerMediaId: message.documentMessage.url,
            filename: message.documentMessage.fileName,
            caption: message.documentMessage.caption
          }
        };
      }

      // Audio message
      if (message.audioMessage) {
        return {
          providerMessageId,
          from: from.split('@')[0],
          timestamp,
          type: 'audio',
          media: {
            url: message.audioMessage.url,
            mime: message.audioMessage.mimetype,
            providerMediaId: message.audioMessage.url
          }
        };
      }

      return null;
    } catch (error) {
      console.error('[BaileysProvider] Error parsing message:', error);
      return null;
    }
  }

  async sendText(to, body) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      throw new Error('Baileys socket not connected');
    }

    try {
      const jid = this.normalizeRecipientJid(to);
      await this.socket.sendMessage(jid, { text: body });
      console.log(`[BaileysProvider] Sent text to ${jid}`);
    } catch (error) {
      console.error('[BaileysProvider] Error sending text:', error);
      throw error;
    }

  }

  normalizeRecipientJid(to) {
    const recipient = String(to || '').trim();
    if (!recipient) throw new Error('WhatsApp recipient JID is required');
    return recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;
  }

  async sendPoll(to, body, options) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      throw new Error('Baileys socket not connected');
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      const msg = await this.socket.sendMessage(jid, {
        poll: {
          name: body,
          values: options,
          selectableCount: 1
        }
      });
      
      this.pollCache = this.pollCache || new Map();
      this.pollCache.set(msg.key.id, msg);
      
      console.log(`[BaileysProvider] Sent poll to ${to}`);
    } catch (error) {
      console.error('[BaileysProvider] Error sending poll:', error);
      throw error;
    }
  }

  async sendImage(to, url, caption) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      throw new Error('Baileys socket not connected');
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      await this.socket.sendMessage(jid, {
        image: { url },
        caption: caption || ''
      });
      console.log(`[BaileysProvider] Sent image to ${to}`);
    } catch (error) {
      console.error('[BaileysProvider] Error sending image:', error);
      throw error;
    }
  }

  async sendDocument(to, url, filename) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      throw new Error('Baileys socket not connected');
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      await this.socket.sendMessage(jid, {
        document: { url },
        fileName: filename || 'document',
        mimetype: 'application/pdf'
      });
      console.log(`[BaileysProvider] Sent document to ${to}`);
    } catch (error) {
      console.error('[BaileysProvider] Error sending document:', error);
      throw error;
    }
  }

  async downloadMedia(mediaRef) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      throw new Error('Baileys socket not connected');
    }

    try {
      const buffer = await this.socket.downloadMediaMessage(mediaRef);
      return { buffer, mime: 'application/octet-stream' };
    } catch (error) {
      console.error('[BaileysProvider] Error downloading media:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.socket) {
      try {
        await this.socket.logout();
        this.connectionStatus = 'disconnected';
        console.log(`[BaileysProvider] Disconnected`);
      } catch (error) {
        console.error('[BaileysProvider] Error during disconnect:', error);
      }
    }
  }

  cleanupAuth() {
    try {
      const authPath = path.join(this.authPath, this.instanceId);
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log(`[BaileysProvider] Cleaned up auth files for ${this.instanceId}`);
      }
    } catch (error) {
      console.error('[BaileysProvider] Error cleaning up auth:', error);
    }
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      phoneNumber: this.phoneNumber,
      qrCode: this.qrCode
    };
  }
}

module.exports = { BaileysProvider };
