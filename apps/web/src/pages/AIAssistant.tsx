import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles, RotateCcw, Copy, Check } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface Message { role: 'user'|'assistant'; content: string; ts: Date; }

const SUGGESTED = [
  'Summarize my active work orders',
  'Which properties have overdue maintenance?',
  'Generate a monthly financial summary',
  'What inspections are scheduled this week?',
  'Which units are currently vacant?',
  'List contractors available for plumbing work',
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useMutation({
    mutationFn: (prompt: string) => api.post('/ai/chat', { message: prompt, history: messages.map(m=>({role:m.role,content:m.content})) }).then(r=>r.data),
    onMutate: (prompt) => {
      setMessages(prev=>[...prev, { role:'user', content: prompt, ts: new Date() }]);
      setTyping(true);
      setInput('');
    },
    onSuccess: (data) => {
      setTyping(false);
      setMessages(prev=>[...prev, { role:'assistant', content: data.data?.response || data.response || 'No response received.', ts: new Date() }]);
    },
    onError: () => {
      setTyping(false);
      setMessages(prev=>[...prev, { role:'assistant', content: 'Sorry, I encountered an error. Please try again.', ts: new Date() }]);
    }
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing]);

  const send = () => { if(input.trim()) ask.mutate(input.trim()); };
  const reset = () => setMessages([]);

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => (
      <span key={i}>{line}{i < content.split('\n').length - 1 && <br />}</span>
    ));
  };

  return (
    <Layout title="AI Assistant">
      <div className="flex flex-col h-[calc(100vh-10rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Assistant</h1>
              <p className="text-xs text-gray-500">Powered by GPT-4o · Simply Service Intelligence</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" icon={<RotateCcw className="w-4 h-4" />} onClick={reset}>New Chat</Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">How can I help you?</h2>
              <p className="text-gray-500 text-sm mb-8 max-w-md">Ask me anything about your properties, work orders, tenants, financials, or get operational insights and summaries.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {SUGGESTED.map((s,i)=>(
                  <button key={i} onClick={()=>ask.mutate(s)} className="text-left p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-sm text-gray-700 font-medium shadow-sm">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((m, i)=>(
            <div key={i} className={cn('flex gap-3', m.role==='user' && 'flex-row-reverse')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0', m.role==='assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gray-200 text-gray-700')}>
                {m.role==='assistant' ? <Sparkles className="w-4 h-4" /> : 'M'}
              </div>
              <div className={cn('max-w-[75%] group', m.role==='user' && 'items-end flex flex-col')}>
                <div className={cn('rounded-2xl px-4 py-3 text-sm leading-relaxed', m.role==='assistant' ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm' : 'bg-indigo-600 text-white rounded-tr-none')}>
                  {formatContent(m.content)}
                </div>
                <div className={cn('flex items-center gap-1 mt-1', m.role==='user' ? 'flex-row-reverse' : '')}>
                  <span className="text-xs text-gray-400">{m.ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                  {m.role==='assistant' && <CopyButton text={m.content} />}
                </div>
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex gap-3 items-end bg-white border border-gray-300 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all shadow-sm">
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-32"
              placeholder="Ask about your properties, work orders, financials..."
              value={input}
              onChange={e=>{ setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }}
            />
            <button onClick={send} disabled={!input.trim()||ask.isPending} className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">AI responses are generated and may require verification.</p>
        </div>
      </div>
    </Layout>
  );
}
