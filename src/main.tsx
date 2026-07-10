import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { requestPersistentStorage } from '@/services/platform/platformBridge'
import './styles/variables.css'
import './styles/global.css'

void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
