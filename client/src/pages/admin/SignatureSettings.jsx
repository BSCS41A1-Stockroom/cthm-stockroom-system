import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/authorization.css";

export default function SignatureSettings() {
  const [image, setImage] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { authenticatedFetch("/api/authorizations/signature").then((r) => r.json()).then((r) => setImage(r.image || "")).catch(() => setMessage("Unable to load your signature.")); }, []);
  const choose = (event) => {
    const file = event.target.files?.[0];
    if (!file || !["image/png", "image/jpeg"].includes(file.type) || file.size > 262144) { setMessage("Choose a PNG or JPEG no larger than 256 KB."); return; }
    const reader = new FileReader(); reader.onload = () => { setImage(String(reader.result)); setMessage(""); }; reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!image) return setMessage("Choose your signature image first.");
    setSaving(true); setMessage("");
    try { const response = await authenticatedFetch("/api/authorizations/signature", { method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({image}) }); const result=await response.json(); if(!response.ok) throw new Error(result.message); setMessage("Signature saved securely to your professor account."); }
    catch(error){setMessage(error.message || "Unable to save signature.");} finally{setSaving(false);}
  };
  return <main className="signature-page"><header><span>Professor e-signature</span><h1>Signature Settings</h1><p>This signature is applied only after you review and explicitly authorize a request.</p></header><section className="signature-card"><div className="signature-preview">{image?<img src={image} alt="Professor signature preview"/>:<p>No signature saved yet.</p>}</div><label className="signature-upload">Choose signature image<input type="file" accept="image/png,image/jpeg" onChange={choose}/></label><p className="signature-help">Use a transparent PNG for the cleanest result. Your profile full name and signing date are added automatically.</p>{message&&<p className="authorization-message">{message}</p>}<button type="button" onClick={save} disabled={saving}>{saving?"Saving...":"Save Signature"}</button></section></main>;
}
