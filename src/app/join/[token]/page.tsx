'use client';
import { Suspense, use } from 'react';
import { AuthForm } from '@/components/AuthForm';

/** Personal invitation link: /join/<token> */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense>
      <AuthForm token={token} />
    </Suspense>
  );
}
