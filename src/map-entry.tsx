import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MapApp from './MapApp'
import { I18nProvider } from './i18n'
import './styles/tokens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <MapApp />
    </I18nProvider>
  </StrictMode>,
)
