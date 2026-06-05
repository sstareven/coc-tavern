import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App.tsx'
import { startAutoNameFormFields } from './utils/auto-name-form-fields'

// 启动 polyfill：自动给页面里所有缺 name+id 的 form field 加唯一 name,消除浏览器
// "A form field element should have an id or name attribute" 警告。React 渲染后
// 通过 MutationObserver 持续给新增 form field 补 name。详见 auto-name-form-fields.ts。
startAutoNameFormFields();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
