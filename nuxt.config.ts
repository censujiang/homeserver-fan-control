export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  pages: false,
  compatibilityDate: '2025-07-15',
  devServer: { host: '127.0.0.1' },
  nitro: { preset: 'bun', serveStatic: 'inline', externals: { inline: ['vue', '@vue/'], external: ['bun:sqlite'] } },
  typescript: { strict: true },
  app: { head: { title: 'HomeServer Fan Control', meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }] } }
})
