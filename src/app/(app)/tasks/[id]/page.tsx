'use client';
import { use } from 'react';
import { TaskView } from '@/components/TaskView';

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TaskView key={id} id={id} />;
}
