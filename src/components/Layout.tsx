import Footer from './Footer'
import type React from 'react'

export default function Layout({ children, hideFooter = false }: { children: React.ReactNode; hideFooter?: boolean }) {
  return (
    <main className="flex h-screen w-full flex-col items-center pb-4">
      {children}
      {!hideFooter && <Footer />}
    </main>
  )
}
