import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { GlobalOutlined } from '@ant-design/icons';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
    localStorage.setItem('i18nextLng', value);
  };

  return (
    <Select
      value={i18n.resolvedLanguage || 'en'}
      onChange={handleChange}
      style={{ width: 130, marginLeft: 16 }}
      suffixIcon={<GlobalOutlined style={{ color: '#8c8c8c' }} />}
      options={[
        { value: 'en', label: 'English' },
        { value: 'fr', label: 'Français' },
        { value: 'ar', label: 'العربية' }
      ]}
      dropdownStyle={{
        background: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid rgba(79, 172, 254, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}
    />
  );
};

export default LanguageSwitcher;
