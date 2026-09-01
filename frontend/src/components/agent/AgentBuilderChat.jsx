import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

export default function AgentBuilderChat({ config, setConfig, onSave }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your AI agent builder. What kind of voice agent would you like to create today? For example, 'I want a dental clinic assistant'." }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const response = await axios.post('http://localhost:8083/api/agents/builder-chat', {
        message: userMessage,
        currentConfig: config,
        chatHistory: messages.map(m => ({ role: m.role, content: m.content }))
      });

      const { reply, updatedConfig } = response.data;

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      if (updatedConfig && Object.keys(updatedConfig).length > 0) {
        setConfig(prevConfig => ({ ...prevConfig, ...updatedConfig }));
      }
    } catch (err) {
      console.error('Failed to send builder chat', err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error while processing that request. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-border min-w-0 flex-1">
      <div className="p-4 border-b border-border flex justify-between items-center bg-card shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Agent Builder
        </h1>
        <div className="flex gap-2">
          <Button onClick={onSave} size="sm" className="gap-2">
            Save Agent
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl mx-auto pb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              
              <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                  : 'bg-zinc-800 text-zinc-200 rounded-tl-sm border border-zinc-700/50'
              }`}>
                {msg.content}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-800 border border-zinc-700/50 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-xs text-zinc-400">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto flex items-end gap-2 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your agent, e.g. 'I want an AI that books appointments for my salon...'"
            className="w-full min-h-[60px] max-h-[200px] resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-12"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-3 bottom-3 p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
