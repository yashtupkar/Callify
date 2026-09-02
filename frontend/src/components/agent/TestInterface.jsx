import { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, PhoneOff, User, Send, Loader2 } from 'lucide-react';

export default function TestInterface({
  agentName,
  isConnected,
  isAgentSpeaking,
  transcript,
  onStartCall,
  onEndCall,
  onSendText
}) {
  const [chatInput, setChatInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [transcript]);

  const handleStartCall = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      await onStartCall();
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndCall = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await onEndCall();
    } finally {
      setIsEnding(false);
    }
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendText(chatInput.trim());
      setChatInput('');
    }
  };

  return (
    <div className="w-[450px] h-full bg-zinc-950 flex flex-col shrink-0 border-l border-border">
      {/* Agent avatar + call controls */}
      <div className="p-6 border-b border-border flex flex-col items-center justify-center bg-card shrink-0">
        <div className="relative mt-4">
          {isAgentSpeaking && (
            <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping" />
          )}
          <Avatar
            className={`w-24 h-24 border-4 ${isAgentSpeaking
                ? 'border-primary shadow-[0_0_30px_rgba(168,85,247,0.4)]'
                : 'border-zinc-800'
              } transition-all duration-300`}
          >
            <AvatarImage
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(agentName || 'agent')}&backgroundColor=09090b`}
            />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
        </div>

        <h3 className="mt-4 text-lg font-medium tracking-tight">
          {isConnected
            ? (isAgentSpeaking ? 'Agent Speaking…' : 'Listening…')
            : (agentName || 'Select an agent')
          }
        </h3>

        <div className="mt-6">
          {!isConnected ? (
            <Button
              onClick={handleStartCall}
              size="lg"
              className="rounded-full px-8 shadow-lg gap-2"
              disabled={!agentName || isStarting}
            >
              {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
              {isStarting ? 'Connecting…' : 'Test Call'}
            </Button>
          ) : (
            <Button
              onClick={handleEndCall}
              size="lg"
              variant="destructive"
              className="rounded-full px-8 shadow-lg gap-2"
              disabled={isEnding}
            >
              {isEnding ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
              {isEnding ? 'Ending…' : 'End Call'}
            </Button>
          )}
        </div>
      </div>

      {/* Live transcript */}
      <div className="flex-1 overflow-hidden relative bg-zinc-950 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto scrollbar-thin" ref={scrollRef}>
          <div className="p-4 min-h-full">
            {transcript.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 italic text-sm min-h-[200px]">
                Transcript will appear here…
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {transcript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[85%] ${msg.speaker === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Avatar className="w-7 h-7 mt-1 border border-zinc-800 shrink-0">
                        {msg.speaker === 'user' ? (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-zinc-300" />
                          </div>
                        ) : (
                          <AvatarImage
                            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(agentName || 'agent')}&backgroundColor=09090b`}
                          />
                        )}
                      </Avatar>
                      <div
                        className={`p-3 rounded-2xl ${msg.speaker === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                          } ${!msg.isFinal ? 'opacity-70' : ''}`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        {!msg.isFinal && (
                          <span className="inline-block w-1.5 h-1.5 ml-2 bg-current rounded-full animate-pulse" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Text input (only while connected) */}
        {isConnected && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-950 shrink-0">
            <form onSubmit={handleSendText} className="flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message to test…"
                className="bg-zinc-900 border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-primary/50"
              />
              <Button type="submit" size="icon" className="shrink-0 hover:bg-primary/90" disabled={!chatInput.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}