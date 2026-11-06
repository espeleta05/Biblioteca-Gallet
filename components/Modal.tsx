import { FormEvent } from "react";
import { Icon } from "./Icon";

export function Field({ label, name, placeholder, type = "text", required, defaultValue }: { label: string; name: string; placeholder: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} /></label>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><span className="eyebrow">SIGEB</span><h2>{title}</h2></div><button className="close-button" onClick={onClose}><Icon name="close" /></button></div>{children}</div></div>;
}

export function SelectRole({ value = "Alumno" }: { value?: string }) {
  return <select name="role" defaultValue={value}><option>Bibliotecario</option></select>;
}
