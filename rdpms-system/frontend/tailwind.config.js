/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        // 主色对齐参考仓库（Tianjiabing_foodtestlab@Product_tencent_CVM）强调色
        // --accent #1a73e8 / --accent-strong #1d4ed8
        primary: {
          50: '#eef4fe',
          100: '#d9e7fd',
          200: '#b7d2fb',
          300: '#8ab6f8',
          400: '#4f92f2',
          500: '#1a73e8',  // --accent
          600: '#1d4ed8',  // --accent-strong
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        danger: {
          500: '#FF453A',  // --danger
        },
        success: {
          500: '#30D158',  // --success
        },
        warning: {
          500: '#FFD60A',  // --warning
        },
      },
      fontFamily: {
        // 与参考仓库一致：正文 Source Sans 3，标题 DM Sans，等宽 JetBrains Mono
        sans: ['"Source Sans 3"', '"DM Sans"', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        display: ['"DM Sans"', '"Source Sans 3"', 'system-ui', '"PingFang SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        glass: '1.7rem',
        panel: '1rem',
      },
      boxShadow: {
        glass:
          '0 16px 46px rgba(40,60,100,0.20), inset 0 2px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 0 34px rgba(255,255,255,0.30)',
        'glass-dark':
          '0 16px 46px rgba(10,20,40,0.30), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.10)',
      },
    },
  },
  plugins: [],
}
