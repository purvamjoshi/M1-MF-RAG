/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'groww-primary': '#5367FF',
        'groww-green': '#9CE2C6',
        'groww-dark': '#44475B',
        'groww-bg': '#F8F9FA',
        'groww-chat-bg': '#FFFFFF',
        'groww-user-msg': '#5367FF',
        'groww-bot-msg': '#F3F4F6',
      },
    },
  },
  plugins: [],
}
