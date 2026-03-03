import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const envPortal = import.meta.env.VITE_PORTAL
const portal = envPortal === 'citizen' || envPortal === 'gov' ? envPortal : 'all'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App portal={portal} />
  </StrictMode>,
)
