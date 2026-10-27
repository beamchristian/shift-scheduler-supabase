import type { ReactNode } from "react";

// The title and short description at the top of a screen.
export function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className='mb-4'>
      <h1 className='text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
        {title}
      </h1>
      {children && (
        <p className='mt-1 max-w-3xl text-sm text-slate-600'>{children}</p>
      )}
    </div>
  );
}
