
import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PaperPlaneRight, User } from 'phosphor-react'

const Chat = () => {
    const { user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeChatId = searchParams.get('id')

    const [chats, setChats] = useState([])
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [loadingChats, setLoadingChats] = useState(true)
    const messagesEndRef = useRef(null)

    const activeChat = chats.find(c => c.id === activeChatId)

    useEffect(() => {
        fetchChats()

        // Subscribe to new chats
        const chatSubscription = supabase
            .channel('public:chats')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, handleNewChat)
            .subscribe()

        return () => { supabase.removeChannel(chatSubscription) }
    }, [])

    useEffect(() => {
        if (activeChatId) {
            fetchMessages(activeChatId)

            const messageSubscription = supabase
                .channel(`chat:${activeChatId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `chat_id=eq.${activeChatId}`
                }, payload => {
                    setMessages(prev => [...prev, payload.new])
                    scrollToBottom()
                })
                .subscribe()

            return () => { supabase.removeChannel(messageSubscription) }
        }
    }, [activeChatId])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const handleNewChat = (payload) => {
        // Optimistically add chat or refetch. Refetching is safer for joined data.
        fetchChats()
    }

    const fetchChats = async () => {
        try {
            // Supabase is weird with deep joining two foreign keys to same table.
            // We'll fetch chats then related data or use a view. 
            // For simplicity/speed here, fetch chats then map.
            const { data: chatsData, error } = await supabase
                .from('chats')
                .select(`
          id, 
          product_id, 
          buyer_id, 
          seller_id,
          products (title, images),
          buyer:profiles!chats_buyer_id_fkey(username, email),
          seller:profiles!chats_seller_id_fkey(username, email)
        `)
                .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
                .order('created_at', { ascending: false })

            if (error) throw error
            setChats(chatsData)
        } catch (error) {
            console.error('Error feching chats:', error)
        } finally {
            setLoadingChats(false)
        }
    }

    const fetchMessages = async (chatId) => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })

        if (error) console.error(error)
        else {
            setMessages(data)
            setTimeout(scrollToBottom, 100)
        }
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!newMessage.trim() || !activeChatId) return

        try {
            const { error } = await supabase
                .from('messages')
                .insert({
                    chat_id: activeChatId,
                    sender_id: user.id,
                    content: newMessage.trim()
                })

            if (error) throw error
            setNewMessage('')
        } catch (error) {
            console.error('Error sending:', error)
        }
    }

    // Determine chat partner name
    const getChatPartner = (chat) => {
        if (!chat) return 'Unknown'
        const isBuyer = user.id === chat.buyer_id
        const partner = isBuyer ? chat.seller : chat.buyer
        // Fallback if profiles join fails or returns null (RLS or missing profile)
        return partner?.username || partner?.email?.split('@')[0] || (isBuyer ? 'Seller' : 'Buyer')
    }

    return (
        <div style={{
            maxWidth: '1200px',
            margin: '2rem auto',
            padding: '1rem',
            height: 'calc(100vh - 120px)',
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: '1rem'
        }}>

            {/* Sidebar List */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                    Messages
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {loadingChats ? (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : chats.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>No chats yet.</div>
                    ) : (
                        chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => setSearchParams({ id: chat.id })}
                                style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid var(--border-color)',
                                    cursor: 'pointer',
                                    background: activeChatId === chat.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                    {getChatPartner(chat)}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {chat.products?.title}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <User size={24} />
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{getChatPartner(activeChat)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeChat.products?.title}</div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {messages.map(msg => {
                                const isMe = msg.sender_id === user.id
                                return (
                                    <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                                        <div style={{
                                            background: isMe ? 'var(--primary-color)' : 'var(--bg-surface)',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '12px',
                                            borderBottomRightRadius: isMe ? '2px' : '12px',
                                            borderBottomLeftRadius: isMe ? '12px' : '2px',
                                            color: 'white',
                                            wordWrap: 'break-word'
                                        }}>
                                            {msg.content}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: isMe ? 'right' : 'left' }}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={sendMessage} style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem' }}>
                            <input
                                className="input-field"
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                            />
                            <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PaperPlaneRight size={20} weight="fill" />
                            </button>
                        </form>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        Select a conversation to start chatting
                    </div>
                )}
            </div>

        </div>
    )
}

export default Chat
