import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout, ConfigProvider } from 'antd'
import { useTranslation } from 'react-i18next'
import enUS from 'antd/locale/en_US'
import frFR from 'antd/locale/fr_FR'
import arEG from 'antd/locale/ar_EG'
import dayjs from 'dayjs'

import HomePage from './pages/HomePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SettingsPage from './pages/SettingsPage'
import Header from './components/Header'

const { Content } = Layout

function App() {
  const { i18n } = useTranslation()

  const getAntdLocale = () => {
    switch(i18n.resolvedLanguage) {
      case 'fr': return frFR;
      case 'ar': return arEG;
      default: return enUS;
    }
  }

  const isRtl = i18n.resolvedLanguage === 'ar'

  useEffect(() => {
    document.dir = isRtl ? 'rtl' : 'ltr'
    document.documentElement.lang = i18n.resolvedLanguage || 'en'
    dayjs.locale(i18n.resolvedLanguage || 'en')
    
    if (isRtl) {
      document.body.classList.add('rtl-layout');
    } else {
      document.body.classList.remove('rtl-layout');
    }
  }, [isRtl, i18n.resolvedLanguage])

  return (
    <ConfigProvider 
      locale={getAntdLocale()} 
      direction={isRtl ? 'rtl' : 'ltr'}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          colorInfo: '#6366f1',
          colorBgContainer: '#1e1e2d',
          colorBgLayout: '#12121c',
          colorTextBase: '#f8fafc',
          borderRadius: 12,
          fontFamily: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          colorBorder: 'rgba(255, 255, 255, 0.08)'
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 44,
          },
          Card: {
            colorBgContainer: 'rgba(30, 30, 45, 0.6)',
            borderRadiusLG: 20
          }
        }
      }}
    >
      <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
        <Header />
        <Content>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/project/:id" element={<ProjectDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App