import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TopNav } from '@/components/layout/chrome'
import { LessonView } from '@/components/lesson/lesson-view'
import { LESSONS, getLesson } from '@/content/lessons'

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const lesson = getLesson(slug)
  if (!lesson) return {}
  return { title: `${lesson.n}. ${lesson.title}`, description: lesson.idea }
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!getLesson(slug)) notFound()
  return (
    <>
      <TopNav />
      <LessonView slug={slug} />
    </>
  )
}
