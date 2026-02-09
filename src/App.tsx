import { useState, useEffect } from 'react';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatHeader } from './components/ChatHeader';
import { NeuralFeed } from './components/NeuralFeed';
import { OutboundHub } from './components/OutboundHub';
import { useMessages } from './hooks/useMessages';
import { WhatsAppMessage } from './types';
import { registerServiceWorker } from './lib/pushNotifications';

function App() {
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [showMobileChat, setShowMobileChat] = useState(false);
    const { addLocalMessage, refetch } = useMessages();

    useEffect(() => {
        // Just register the SW on load — permission is requested via user gesture
        registerServiceWorker();
    }, []);

    const handleSelectChat = (contactId: string) => {
        setSelectedChat(contactId);
        setShowMobileChat(true);
    };

    const handleBack = () => {
        setShowMobileChat(false);
        setSelectedChat(null);
    };

    const handleMessageSent = (message: Partial<WhatsAppMessage>) => {
        addLocalMessage(message);
        setTimeout(() => refetch(), 500);
    };

    return (
        <div className="flex w-full h-full bg-black overflow-hidden">
            {/* Sidebar - Full width on mobile, hidden when chat is open */}
            <div
                className={`${showMobileChat ? 'hidden' : 'flex'} md:flex w-full md:w-80 lg:w-96 h-full flex-shrink-0`}
            >
                <ChatSidebar
                    onSelectChat={handleSelectChat}
                    selectedChat={selectedChat}
                />
            </div>

            {/* Main Chat Area - Full width on mobile */}
            <div
                className={`${showMobileChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col h-full bg-[#0a0a0a] min-w-0`}
            >
                {selectedChat ? (
                    <>
                        <ChatHeader
                            contactId={selectedChat}
                            onBack={handleBack}
                            showBackButton={true}
                        />
                        <NeuralFeed selectedChat={selectedChat} />
                        <OutboundHub recipientId={selectedChat} onMessageSent={handleMessageSent} />
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center px-4">
                            <div className="w-48 h-48 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#25D366]/5 to-transparent flex items-center justify-center">
                                <svg viewBox="0 0 303 172" width="150" className="text-[#25D366]/20">
                                    <path fill="currentColor" d="M229.565 160.229c32.647-16.024 54.484-49.903 54.484-88.87C284.049 31.921 252.128 0 212.69 0c-28.076 0-52.58 16.166-64.39 39.695C136.49 16.166 111.986 0 83.91 0 44.472 0 12.551 31.921 12.551 71.36c0 38.966 21.837 72.845 54.484 88.869-14.167 6.163-26.452 15.528-35.706 27.2h233.942c-9.254-11.672-21.539-21.037-35.706-27.2z" />
                                </svg>
                            </div>
                            <h2 className="text-white text-xl font-light mb-2">Portal</h2>
                            <p className="text-zinc-500 text-sm">Select a conversation</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
