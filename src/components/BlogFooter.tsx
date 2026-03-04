import Link from 'next/link'
import s from '@/app/blog/blog.module.css'

export default function BlogFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <Link href="/" className={s.logo}>TimeBack</Link>
        <p>&copy; 2026 TimeBack. All rights reserved.</p>
      </div>
    </footer>
  )
}
