export function Logo({ dark, mark }: { dark?: boolean; mark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8" fill={dark ? '#14162b' : '#ff5a36'} />
        <path d="M8 10h16v4h-6v10h-4V14H8z" fill={dark ? '#ff5a36' : '#fff'} />
      </svg>
      {!mark && (
        <span className={`whitespace-nowrap text-[15px] font-extrabold tracking-tight ${dark ? 'text-fg' : 'text-white'}`}>
          Teqnite <span className={dark ? 'text-ember' : 'text-white/60'}>Tasks</span>
        </span>
      )}
    </span>
  );
}
