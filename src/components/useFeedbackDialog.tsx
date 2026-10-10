import { useEffect, useRef, useState } from 'react';
type Message = { text: string; confirm: boolean; resolve: (value: boolean) => void };
export function useFeedbackDialog() {
  const [messages, setMessages] = useState<Message[]>([]);
  const ref = useRef<HTMLDialogElement>(null);
  const current = messages[0];
  useEffect(() => {
    if (current && !ref.current?.open) ref.current?.showModal();
    if (!current) ref.current?.close();
  }, [current]);
  function finish(value: boolean) { current?.resolve(value); setMessages(previous => previous.slice(1)); }
  const confirm = (text: string) => new Promise<boolean>(resolve => setMessages(previous => [...previous, { text, confirm: true, resolve }]));
  const alert = (text: string) => { setMessages(previous => [...previous, { text, confirm: false, resolve: () => undefined }]); };
  const dialog = <dialog ref={ref} aria-labelledby="allgo-feedback-title" aria-describedby="allgo-feedback-text" onCancel={event => { event.preventDefault(); finish(false); }} className="m-auto w-[90%] max-w-sm rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/40"><h2 id="allgo-feedback-title" className="text-lg font-bold">{current?.confirm ? 'Please confirm' : 'AllGo update'}</h2><p id="allgo-feedback-text" className="my-4 text-sm">{current?.text}</p><div className="flex justify-end gap-3">{current?.confirm && <button autoFocus className="rounded-lg border p-3" onClick={() => finish(false)}>Cancel</button>}<button autoFocus={!current?.confirm} className="rounded-lg bg-indigo-600 p-3 text-white" onClick={() => finish(true)}>{current?.confirm ? 'Confirm' : 'OK'}</button></div></dialog>;
  return { alert, confirm, dialog };
}
