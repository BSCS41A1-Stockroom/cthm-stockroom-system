import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import "../../styles/authorization.css";

export default function SignatureSettings({ custodian = false, departmentHead = false }) {
    const { profile } = useAuth();
    const isDepartmentHead = departmentHead || profile?.role === "department_head";
    const isCustodian = custodian || profile?.role === "staff";
    const [image, setImage] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const endpoint = isDepartmentHead ? "/api/authorizations/department-head-signature" : isCustodian ? "/api/authorizations/custodian-signature" : "/api/authorizations/signature";
    const accountType = isDepartmentHead ? "department head" : isCustodian ? "custodian" : "professor";
    const displayType = isDepartmentHead ? "Department Head" : isCustodian ? "Custodian" : "Professor";

    useEffect(() => {
        authenticatedFetch(endpoint)
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Unable to load your signature.");
                setImage(result.image || "");
            })
            .catch((error) => setMessage(error.message || "Unable to load your signature."));
    }, [endpoint]);

    const choose = (event) => {
        const file = event.target.files?.[0];
        if (!file || !["image/png", "image/jpeg"].includes(file.type) || file.size > 262144) {
            setMessage("Choose a PNG or JPEG no larger than 256 KB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => { setImage(String(reader.result)); setMessage(""); };
        reader.readAsDataURL(file);
    };

    const save = async () => {
        if (!image) return setMessage("Choose your signature image first.");
        setSaving(true);
        setMessage("");
        try {
            const response = await authenticatedFetch(endpoint, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Unable to save signature.");
            setMessage(`Signature saved securely to your ${accountType} account.`);
        } catch (error) {
            setMessage(error.message || "Unable to save signature.");
        } finally { setSaving(false); }
    };

    const hasError = message.toLowerCase().includes("unable") || message.toLowerCase().includes("choose");

    return (
        <main className="signature-page">
            <header className="signature-page-header">
                <div className="signature-page-eyebrow">{isDepartmentHead ? "Department-Head Approval" : isCustodian ? "Custodian Verification" : "Professor Authorization"}</div>
                <h1>Signature Settings</h1>
                <p>{isDepartmentHead ? "Manage the personal electronic signature used for final approval within your assigned department." : isCustodian ? "Manage the personal electronic signature used for request verification, item release, and return receiving." : "Manage the electronic signature used when authorizing borrowing requests."}</p>
            </header>
            <section className="signature-card">
                <div className="signature-card-header">
                    <div><span className="signature-card-label">E-Signature</span><h2>{displayType} Signature</h2><p>Your signature is applied only after you explicitly confirm an authorized action.</p></div>
                    <div className="signature-status">{image ? "Signature Ready" : "Not Set"}</div>
                </div>
                <div className="signature-preview-wrapper">
                    <div className="signature-preview-label">Signature Preview</div>
                    <div className="signature-preview">{image ? <img src={image} alt={`${displayType} signature preview`} /> : <div className="signature-empty"><span className="signature-empty-mark">✦</span><strong>No signature saved</strong><small>Upload your signature image below.</small></div>}</div>
                </div>
                <div className="signature-upload-area">
                    <label className="signature-upload"><span>Choose Signature Image</span><input type="file" accept="image/png,image/jpeg" onChange={choose} /></label>
                    <div className="signature-file-info"><strong>PNG or JPEG</strong><span>Maximum file size: 256 KB</span></div>
                </div>
                <p className="signature-help">Use a transparent PNG for the cleanest result. Your profile name and signing date are added automatically. Never upload another person&apos;s signature.</p>
                {message && <div className={`authorization-message ${hasError ? "error" : "success"}`}>{message}</div>}
                <div className="signature-card-footer">
                    <div className="signature-security"><span className="security-icon">✓</span><div><strong>Secure {displayType} Authorization</strong><small>Your signature is associated only with your personal {accountType} account.</small></div></div>
                    <button type="button" className="signature-save-button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Signature"}</button>
                </div>
            </section>
        </main>
    );
}
