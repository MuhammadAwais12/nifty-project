import { redirect } from 'next/navigation';

/** The Messages page became Chat, which also carries project channels. */
export default function MessagesRedirect() {
  redirect('/chat');
}
