import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedbackContext } from "./feedbackContext";
import "./feedback.css";

export default function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState("");
  const timerIds = useRef(new Set());
  const dialogRef = useRef(null);

  useEffect(() => () => {
    for (const timerId of timerIds.current) window.clearTimeout(timerId);
    dialogRef.current?.resolve(false);
  }, []);

  const toast = useCallback((message, type = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-3), { id, message: String(message), type }]);
    const timerId = window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
      timerIds.current.delete(timerId);
    }, 5000);
    timerIds.current.add(timerId);
  }, []);

  const confirm = useCallback((message, options = {}) => new Promise((resolve) => {
    if (dialogRef.current) dialogRef.current.resolve(false);
    const next = { kind: "confirm", message: String(message), title: options.title || "Please confirm", danger: Boolean(options.danger), resolve };
    dialogRef.current = next;
    setDialog(next);
  }), []);

  const prompt = useCallback((message, options = {}) => new Promise((resolve) => {
    if (dialogRef.current) dialogRef.current.resolve(null);
    const next = { kind: "prompt", message: String(message), title: options.title || "Add details", resolve };
    dialogRef.current = next;
    setDialogValue(options.initialValue || "");
    setDialog(next);
  }), []);

  const closeDialog = (accepted) => {
    dialogRef.current?.resolve(dialogRef.current.kind === "prompt" ? (accepted ? dialogValue.trim() : null) : accepted);
    dialogRef.current = null;
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);
  return <FeedbackContext.Provider value={value}>
    {children}
    <div className="app-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((entry) => <div key={entry.id} className={`app-toast ${entry.type}`} role={entry.type === "error" ? "alert" : "status"}>
        <span>{entry.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== entry.id))}>×</button>
      </div>)}
    </div>
    {dialog && <div className="app-confirm-overlay" onClick={() => closeDialog(false)}>
      <div className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message" onClick={(event) => event.stopPropagation()}>
        <h2 id="app-confirm-title">{dialog.title}</h2><p id="app-confirm-message">{dialog.message}</p>
        {dialog.kind === "prompt" && <textarea className="app-prompt-input" autoFocus maxLength="1000" rows="4" value={dialogValue} onChange={(event) => setDialogValue(event.target.value)} aria-label="Details" />}
        <div className="app-confirm-actions"><button type="button" onClick={() => closeDialog(false)}>Cancel</button><button type="button" className={dialog.danger ? "danger" : "primary"} onClick={() => closeDialog(true)} autoFocus={dialog.kind !== "prompt"} disabled={dialog.kind === "prompt" && !dialogValue.trim()}>{dialog.kind === "prompt" ? "Continue" : "Confirm"}</button></div>
      </div>
    </div>}
  </FeedbackContext.Provider>;
}
