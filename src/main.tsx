import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App.tsx'
import { startAutoNameFormFields } from './utils/auto-name-form-fields'
import { installConsoleCapture } from './utils/console-capture';

// 启动 polyfill：自动给页面里所有缺 name+id 的 form field 加唯一 name,消除浏览器
// "A form field element should have an id or name attribute" 警告。React 渲染后
// 通过 MutationObserver 持续给新增 form field 补 name。详见 auto-name-form-fields.ts。
startAutoNameFormFields();

// 全局 console 拦截:把所有 [xxx] 项目命名空间日志写进 IDB (跨刷新可读),
// 缓存面板"复制表格"按钮会把当前会话最近 10 页日志带出来。Idempotent。
// HMR 注意: install 时 HMR 已替换的 console.x 已被前一实例 patch 过,
//   再 patch 会嵌套——所以这里位置紧贴 root 创建之前,保证早于 React。
installConsoleCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
