import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ConfigProvider } from './context/ConfigContext'
import { MessagesProvider } from './hooks/useMessages'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <ConfigProvider>
                    <MessagesProvider>
                        <App />
                    </MessagesProvider>
                </ConfigProvider>
            </BrowserRouter>
        </ErrorBoundary>
    </React.StrictMode>,
)
