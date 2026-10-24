const { OpenAI } = require('openai');

function getOpenAIClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const isRouter = Boolean(process.env.OPENROUTER_API_KEY);
  return new OpenAI({
    baseURL: isRouter ? 'https://openrouter.ai/api/v1' : undefined,
    apiKey,
  });
}

function sanitizeId(text, prefix = 'btn') {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
  return `${prefix}_${clean || 'opt'}`;
}

function buildDeterministicFlow(profile = {}) {
  const name = (profile.businessName || 'Our Business').trim();
  const industry = (profile.industry || 'general').toLowerCase();
  const desc = (profile.description || '').trim();
  const products = Array.isArray(profile.products) ? profile.products.filter(p => p?.name) : [];
  const faqs = Array.isArray(profile.faqs) ? profile.faqs.filter(f => f?.question && f?.answer) : [];
  const phone = profile.businessPhone || '';
  const website = profile.websiteUrl || '';
  const address = profile.address || '';

  // Tailored industry buttons & messages
  let btn1Title = 'Catalog & Deals';
  let btn1Body = `Explore our latest collection and special offers at *${name}*.`;
  let btn2Title = 'Pricing & Info';
  let btn2Body = `Transparent pricing and package options for *${name}*.`;

  if (industry.includes('health') || industry.includes('clinic') || industry.includes('beauty')) {
    btn1Title = 'Services & Care';
    btn1Body = `Here are our popular treatments & services at *${name}*:\n` +
      (products.length ? products.slice(0, 3).map(p => `• *${p.name}*${p.price ? ` (${p.price})` : ''}`).join('\n') : '• General Consultation\n• Premium Treatment\n• Follow-up Care') +
      '\n\nWould you like to book an appointment or speak with our specialist?';
    btn2Title = 'Book Consult';
    btn2Body = `To book your appointment with *${name}*, reply with your preferred date & time, or tap below to speak to our care team.`;
  } else if (industry.includes('restaurant') || industry.includes('food')) {
    btn1Title = 'View Menu';
    btn1Body = `Check out our best dishes at *${name}*:\n` +
      (products.length ? products.slice(0, 3).map(p => `• *${p.name}*${p.price ? ` (${p.price})` : ''}`).join('\n') : '• Chef\'s Special\n• Popular Combos\n• Beverages & Desserts') +
      '\n\nReply with what you crave or tap below to place an order!';
    btn2Title = 'Table / Delivery';
    btn2Body = `We offer dining reservations and fast home delivery. Reply with your party size or order address!`;
  } else if (industry.includes('real_estate')) {
    btn1Title = 'View Listings';
    btn1Body = `Featured properties currently available at *${name}*:\n` +
      (products.length ? products.slice(0, 3).map(p => `• *${p.name}*${p.price ? ` - ${p.price}` : ''}`).join('\n') : '• Luxury Apartments\n• Commercial Spaces\n• Family Villas') +
      '\n\nReply with your budget and preferred location.';
    btn2Title = 'Schedule Tour';
    btn2Body = `Our real estate advisors offer virtual & in-person property walkthroughs. Reply with your convenient time.`;
  } else if (products.length > 0) {
    btn1Title = 'Featured Items';
    btn1Body = `Top items at *${name}*:\n` +
      products.slice(0, 3).map(p => `• *${p.name}*${p.price ? ` — ${p.price}` : ''}`).join('\n') +
      '\n\nReply with any product name to get full details!';
  }

  const rootRule = {
    name: 'Welcome & Main Menu',
    triggerType: 'first_message',
    triggerValue: '',
    matchMode: 'exact',
    responseType: 'button',
    responseConfig: {
      _type: 'button',
      body: `Welcome to *${name}*! 👋\n${desc ? desc + '\n\n' : ''}How can we help you today? Tap an option below:`,
      buttons: [
        { id: 'btn_main_catalog', title: btn1Title.slice(0, 20) },
        { id: 'btn_main_pricing', title: btn2Title.slice(0, 20) },
        { id: 'btn_main_human', title: 'Talk to Agent'.slice(0, 20) },
      ],
    },
    enabled: true,
    priority: 0,
  };

  const branch1 = {
    name: `Branch: ${btn1Title}`,
    triggerType: 'button_press',
    triggerValue: 'btn_main_catalog',
    matchMode: 'exact',
    responseType: 'button',
    responseConfig: {
      _type: 'button',
      body: btn1Body,
      buttons: [
        { id: 'btn_order_now', title: 'Order / Inquire'.slice(0, 20) },
        { id: 'btn_main_human', title: 'Talk to Team'.slice(0, 20) },
      ],
    },
    enabled: true,
    priority: 1,
  };

  const branch2 = {
    name: `Branch: ${btn2Title}`,
    triggerType: 'button_press',
    triggerValue: 'btn_main_pricing',
    matchMode: 'exact',
    responseType: 'button',
    responseConfig: {
      _type: 'button',
      body: btn2Body,
      buttons: [
        { id: 'btn_main_catalog', title: 'See Offerings'.slice(0, 20) },
        { id: 'btn_main_human', title: 'Ask Questions'.slice(0, 20) },
      ],
    },
    enabled: true,
    priority: 2,
  };

  const branchHuman = {
    name: 'Branch: Talk to Agent',
    triggerType: 'button_press',
    triggerValue: 'btn_main_human',
    matchMode: 'exact',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: `Connecting you with a team member at *${name}*. 🧑‍💼\n\nPlease type your question or requirement, and we will get back to you shortly!`,
    },
    enabled: true,
    priority: 3,
  };

  const branchOrder = {
    name: 'Branch: Order / Inquire',
    triggerType: 'button_press',
    triggerValue: 'btn_order_now',
    matchMode: 'exact',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: `Wonderful! Please reply with your requirement, items of interest, or contact number, and our team will confirm immediately!${website ? `\n\nOr browse online: ${website}` : ''}`,
    },
    enabled: true,
    priority: 4,
  };

  // Keyword rules
  const kwPrice = {
    name: 'Keyword: Price & Fees',
    triggerType: 'keyword',
    triggerValue: 'price, pricing, cost, rate, fee, fees, charges, quotation',
    matchMode: 'contains',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: `Here is our pricing overview at *${name}*:\n` +
        (products.length
          ? products.slice(0, 4).map(p => `• ${p.name}: ${p.price || 'Contact for quote'}`).join('\n')
          : 'Our pricing varies depending on your requirements. Contact us for custom quotes!') +
        '\n\nReply with what you need or tap "Talk to Agent" for an exact quotation.',
    },
    enabled: true,
    priority: 5,
  };

  const kwHours = {
    name: 'Keyword: Hours & Timing',
    triggerType: 'keyword',
    triggerValue: 'hours, timing, open, close, timings, schedule',
    matchMode: 'contains',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: `🕒 *Business Hours for ${name}*:\nWe are open Monday to Saturday, 9:00 AM – 7:00 PM.\nSundays: By appointment.\n\nFeel free to leave a message anytime!`,
    },
    enabled: true,
    priority: 6,
  };

  const kwLocation = {
    name: 'Keyword: Location & Directions',
    triggerType: 'keyword',
    triggerValue: 'location, address, where, map, directions, visit',
    matchMode: 'contains',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: address
        ? `📍 You can find *${name}* at:\n${address}\n\nLet us know if you need help finding us!`
        : `📍 We are centrally located. Reply with your city or area to get exact directions and nearest branch details!`,
    },
    enabled: true,
    priority: 7,
  };

  const kwHuman = {
    name: 'Keyword: Human Support',
    triggerType: 'keyword',
    triggerValue: 'human, agent, person, representative, help, support, talk',
    matchMode: 'contains',
    responseType: 'text',
    responseConfig: {
      _type: 'text',
      text: `Transferring you to a live representative at *${name}*. 🧑‍💼\nAn agent has been notified and will assist you in this chat right away.`,
    },
    enabled: true,
    priority: 8,
  };

  const rules = [rootRule, branch1, branch2, branchHuman, branchOrder, kwPrice, kwHours, kwLocation, kwHuman];

  // If user provided specific FAQs, turn the top 2 into keyword rules
  faqs.slice(0, 2).forEach((faq, idx) => {
    const kw = Array.isArray(faq.keywords) && faq.keywords.length
      ? faq.keywords.join(', ')
      : faq.question.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 4).join(', ');
    rules.push({
      name: `FAQ: ${faq.question.slice(0, 30)}`,
      triggerType: 'keyword',
      triggerValue: kw || 'faq',
      matchMode: 'contains',
      responseType: 'text',
      responseConfig: {
        _type: 'text',
        text: `*${faq.question}*\n\n${faq.answer}`,
      },
      enabled: true,
      priority: rules.length,
    });
  });

  return rules;
}

async function generateFlowWithAI(profile = {}, userPrompt = '') {
  const client = getOpenAIClient();
  if (!client) {
    console.log('[FlowGenerator] No LLM API key available, using rich deterministic generator');
    return buildDeterministicFlow(profile);
  }

  const businessName = profile.businessName || 'Business';
  const industry = profile.industry || 'general';
  const description = profile.description || '';
  const products = (profile.products || []).slice(0, 6).map(p => `${p.name} ($${p.price || 'N/A'}): ${p.description || ''}`).join('\n');
  const faqs = (profile.faqs || []).slice(0, 5).map(f => `Q: ${f.question} | A: ${f.answer}`).join('\n');
  const language = profile.language || 'en-US';

  const systemInstruction = `You are an elite WhatsApp conversational flow architect.
Generate a structured WhatsApp auto-reply tree (no-code decision flow) that maximizes lead conversion and customer delight.

CRITICAL WHATSAPP CLOUD API CONSTRAINTS:
1. Interactive Button messages can have MAXIMUM 3 buttons.
2. Button titles MUST be short (<= 20 characters).
3. Button IDs MUST be unique alphanumeric/underscore/hyphen strings (e.g. "btn_services", "btn_pricing", "btn_book").
4. Response text bodies must be <= 1024 characters.
5. All text should look great on mobile WhatsApp with bolding (*bold*) and emojis.
6. The tree MUST be connected:
   - Root rule: triggerType="first_message", responseType="button", containing 2 or 3 buttons (e.g. btn_catalog, btn_pricing, btn_agent).
   - For EACH button on the root rule, create a corresponding child rule with triggerType="button_press" and triggerValue equal to that button's ID.
   - Child rules can have their own follow-up buttons leading to deeper replies or actions.
   - Include 3 to 5 common keyword rules (e.g. triggerType="keyword", triggerValue="price, cost, fees", matchMode="contains").

Return ONLY valid JSON matching this exact structure:
{
  "rules": [
    {
      "name": "Welcome & Main Menu",
      "triggerType": "first_message",
      "triggerValue": "",
      "matchMode": "exact",
      "responseType": "button",
      "responseConfig": {
        "_type": "button",
        "body": "Welcome text...",
        "buttons": [
          { "id": "btn_services", "title": "Our Services" },
          { "id": "btn_pricing", "title": "Pricing" },
          { "id": "btn_agent", "title": "Talk to Human" }
        ]
      },
      "enabled": true,
      "priority": 0
    },
    ...
  ]
}`;

  const promptContent = `
Business Profile:
- Business Name: ${businessName}
- Industry: ${industry}
- Description: ${description}
- Products / Services:
${products || 'None specified'}
- FAQs:
${faqs || 'None specified'}
- Language: ${language}
${userPrompt ? `- Special Instructions from User: ${userPrompt}` : ''}

Generate 6 to 10 interconnected WhatsApp auto-reply rules forming a complete, high-converting WhatsApp flow.`;

  try {
    const model = process.env.VOICE_LLM_MODEL || 'openai/gpt-4o-mini';
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: promptContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 3000,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty response from LLM');

    const parsed = JSON.parse(raw);
    const rules = Array.isArray(parsed.rules) ? parsed.rules : (Array.isArray(parsed) ? parsed : null);

    if (!rules || !rules.length) {
      throw new Error('LLM did not return an array of rules');
    }

    // Sanitize and validate every generated rule
    const sanitizedRules = rules.map((r, idx) => {
      const triggerType = ['first_message', 'button_press', 'keyword', 'list_row', 'always'].includes(r.triggerType)
        ? r.triggerType
        : (idx === 0 ? 'first_message' : 'keyword');

      const responseType = ['button', 'text', 'list', 'cta_url', 'media'].includes(r.responseType)
        ? r.responseType
        : 'text';

      let responseConfig = r.responseConfig || {};
      if (responseType === 'button') {
        const rawBtns = Array.isArray(responseConfig.buttons) ? responseConfig.buttons : [];
        const buttons = rawBtns.slice(0, 3).map((b, bi) => ({
          id: String(b.id || sanitizeId(b.title || `btn_${idx}_${bi}`)).slice(0, 40),
          title: String(b.title || `Option ${bi + 1}`).slice(0, 20),
        }));
        if (!buttons.length) {
          buttons.push({ id: `btn_${idx}_info`, title: 'More Info' });
        }
        responseConfig = {
          _type: 'button',
          body: String(responseConfig.body || responseConfig.text || `Hello from ${businessName}!`).slice(0, 1024),
          buttons,
        };
      } else if (responseType === 'text') {
        responseConfig = {
          _type: 'text',
          text: String(responseConfig.text || responseConfig.body || `Hello from ${businessName}!`).slice(0, 1024),
        };
      } else if (responseType === 'cta_url') {
        responseConfig = {
          _type: 'cta_url',
          body: String(responseConfig.body || responseConfig.text || `Visit our website:`).slice(0, 1024),
          displayText: String(responseConfig.displayText || 'Visit Website').slice(0, 20),
          url: responseConfig.url || profile.websiteUrl || 'https://google.com',
        };
      }

      return {
        name: String(r.name || `Rule ${idx + 1}`).slice(0, 60),
        triggerType,
        triggerValue: String(r.triggerValue || '').slice(0, 100),
        matchMode: r.matchMode || (triggerType === 'keyword' ? 'contains' : 'exact'),
        responseType,
        responseConfig,
        enabled: r.enabled !== false,
        priority: idx,
      };
    });

    console.log(`[FlowGenerator] Successfully generated ${sanitizedRules.length} rules with AI model ${model}`);
    return sanitizedRules;
  } catch (err) {
    console.warn(`[FlowGenerator] AI generation encountered error (${err.message}), falling back to deterministic flow:`, err.message);
    return buildDeterministicFlow(profile);
  }
}

module.exports = {
  generateFlowWithAI,
  buildDeterministicFlow,
};
