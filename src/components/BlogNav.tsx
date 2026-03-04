import Link from 'next/link'
import MobileMenuToggle from '@/components/MobileMenuToggle'
import s from '@/app/blog/blog.module.css'

export default function BlogNav() {
  return (
    <nav className={s.nav}>
      <Link href="/" className={s.logo}>TimeBack</Link>
      <MobileMenuToggle />
      <div className={s.navRight}>
        <Link href="/blog">Blog</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/sign-up" className={s.btn}>Start Free</Link>
      </div>
    </nav>
  )
}
