import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Search, Plus, MessageSquare } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useSocket } from '../hooks/useSocket';
import api from '../lib/api';
import { formatDate, cn, toArray } from '../lib/utils';

function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: (d:any) => api.post('/messages/conversations', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['conversations']}); onClose(); setSubject(''); setMessage(''); }
  });
  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <div className="space-y-4">
        <Input label="Subject" placeholder="What's this about?" value={subject} onChange={e=>setSubject(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Type your message..." value={message} onChange={e=>setMessage(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({subject,initialMessage:message})}>Send</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Messages() {
  const [selected, setSelected] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { socket } = useSocket();

  const { data: convData } = useQuery({ queryKey:['conversations'], queryFn: () => api.get('/messages/conversations').then(r=>r.data), refetchInterval: 10000 });
  const { data: msgData } = useQuery({ queryKey:['messages', selected], queryFn: () => api.get(`/messages/conversations/${selected}/messages`).then(r=>r.data), enabled: !!selected, refetchInterval: 5000 });

  const sendMsg = useMutation({
    mutationFn: (content:string) => api.post(`/messages/conversations/${selected}/messages`, { content }).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['messages', selected]}); setNewMsg(''); }
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgData]);

  useEffect(() => {
    if (!socket || !selected) return;
    socket.emit('join_conversation', selected);
    socket.on('new_message', () => qc.invalidateQueries({queryKey:['messages', selected]}));
    return () => { socket.off('new_message'); socket.emit('leave_conversation', selected); };
  }, [socket, selected]);

  const conversationList = toArray<any>(convData?.data?.conversations ?? convData?.conversations);
  const conversations = conversationList.filter((c:any) => !search || c.subject?.toLowerCase().includes(search.toLowerCase()));
  const messages = toArray<any>(msgData?.data?.messages ?? msgData?.messages);
  const activeConv = conversations.find((c:any)=>c.id===selected);

  return (
    <Layout title="Messages">
      <div className="flex h-[calc(100vh-10rem)] gap-0 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Messages</h2>
              <button onClick={()=>setShowNew(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search conversations..." value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : conversations.map((c:any)=>(
              <button key={c.id} onClick={()=>setSelected(c.id)} className={cn('w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors', selected===c.id && 'bg-indigo-50 border-l-4 border-l-indigo-600')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">{c.subject||'No subject'}</span>
                  {c.unreadCount > 0 && <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 ml-1 flex-shrink-0">{c.unreadCount}</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{c.lastMessage?.content||'No messages yet'}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(c.updatedAt)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selected && activeConv ? (
            <>
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-900">{activeConv.subject||'Conversation'}</h3>
                <p className="text-xs text-gray-500">{activeConv.participants?.length||0} participants</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m:any)=>(
                  <div key={m.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                      {(m.sender?.firstName?.[0]||'?').toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{m.sender?.firstName} {m.sender?.lastName}</span>
                        <span className="text-xs text-gray-400">{formatDate(m.createdAt)}</span>
                      </div>
                      <div className="bg-gray-100 rounded-xl rounded-tl-none px-4 py-2 text-sm text-gray-800 inline-block max-w-lg">{m.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-3">
                  <input className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Type a message..." value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(newMsg.trim())sendMsg.mutate(newMsg.trim());}}} />
                  <Button onClick={()=>{if(newMsg.trim())sendMsg.mutate(newMsg.trim());}} loading={sendMsg.isPending} icon={<Send className="w-4 h-4" />}>Send</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Or start a new one to begin messaging</p>
              <Button className="mt-6" icon={<Plus className="w-4 h-4" />} onClick={()=>setShowNew(true)}>New Conversation</Button>
            </div>
          )}
        </div>
      </div>
      <NewConversationModal open={showNew} onClose={()=>setShowNew(false)} />
    </Layout>
  );
}
