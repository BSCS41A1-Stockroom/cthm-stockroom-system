import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import QRCode from "qrcode";
import QrManagementModal from "../../components/admin/Users/QrManagementModal";
import "../../styles/users.css";

const EMPTY_FORM = {
  email: "",
  fullName: "",
  role: "student",
  studentId: "",
  isActive: true,
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrUser, setQrUser] = useState(null);
  const [selectedQrUsers, setSelectedQrUsers] = useState([]);
  const [printCards, setPrintCards] = useState([]);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const response = await authenticatedFetch(
        `/api/users?search=${encodeURIComponent(search)}`,
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to load users.");
      }
      if (sequence === loadSequence.current) {
        setUsers(result.users);
        setError("");
      }
    } catch (requestError) {
      if (sequence === loadSequence.current) setError(requestError.message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => {
      window.clearTimeout(timer);
      loadSequence.current += 1;
    };
  }, [load]);

  function edit(user) {
    setEditing(user.user_id);
    setForm({
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      studentId: user.student_id || "",
      isActive: user.is_active,
    });
    setFormError("");
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const inviting = editing === "new";
      const path = inviting ? "/api/users/invite" : `/api/users/${editing}`;
      const response = await authenticatedFetch(path, {
        method: inviting ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.reasons?.[0] || result.message || "Unable to save user.",
        );
      }
      setEditing(null);
      setForm(EMPTY_FORM);
      setSuccess(inviting
        ? "User added. A secure account activation email has been sent."
        : "User account updated successfully.");
      await load();
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function openAddUser() {
    setEditing("new");
    setForm(EMPTY_FORM);
    setFormError("");
    setSuccess("");
  }

  function toggleQrUser(userId) {
    setSelectedQrUsers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function printSelectedQrCodes() {
    if (!selectedQrUsers.length || saving) return;
    setSaving(true); setError("");
    try {
      const selected = users.filter((user) => selectedQrUsers.includes(user.user_id) && user.role === "student");
      const records = await Promise.all(selected.map(async (user) => {
        const response = await authenticatedFetch(`/api/qr/users/${user.user_id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || `Unable to load QR for ${user.full_name}.`);
        if (!body.token) return null;
        const printed = await authenticatedFetch(`/api/qr/users/${user.user_id}/print`, { method: "POST" });
        const printedBody = await printed.json();
        if (!printed.ok) throw new Error(printedBody.message || `Unable to prepare QR for ${user.full_name}.`);
        return { ...printedBody, image: await QRCode.toDataURL(printedBody.token, { width: 360, margin: 2, errorCorrectionLevel: "M" }) };
      }));
      const printable = records.filter(Boolean);
      if (!printable.length) throw new Error("The selected students do not have printable QR codes. Generate replacements for revoked codes first.");
      setPrintCards(printable);
      window.addEventListener("afterprint", () => setPrintCards([]), { once: true });
      window.setTimeout(() => window.print(), 0);
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="users-page">
      <header>
        <h1>User Management</h1>
        <p>Add users through secure email activation and manage their roles and access.</p>
      </header>

      <div className="users-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, or student ID"
        />
        <button onClick={openAddUser}>Add User</button>
        <button className="qr-batch-button" disabled={!selectedQrUsers.length || saving} onClick={printSelectedQrCodes}>Print Selected QR ({selectedQrUsers.length})</button>
      </div>

      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="users-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="qr-select-column" aria-label="Select QR labels" /><th>User</th><th>Role</th><th>Student ID</th><th>Status</th><th>QR Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.role === "student" && <input type="checkbox" aria-label={`Select ${user.full_name} QR`} checked={selectedQrUsers.includes(user.user_id)} onChange={() => toggleQrUser(user.user_id)} />}</td>
                  <td><strong>{user.full_name}</strong><small>{user.email}</small></td>
                  <td>{user.role}</td>
                  <td>{user.student_id || "-"}</td>
                  <td>
                    <span className={`user-status ${user.is_active ? "active" : "inactive"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{user.role === "student" ? <span className={`qr-status ${user.qr_status || "not_issued"}`}>{({ not_issued: "Not Issued", active: "Active", revoked: "Revoked", replacement_required: "Replacement Required" })[user.qr_status] || "Not Issued"}</span> : "-"}</td>
                  <td><div className="user-row-actions"><button onClick={() => edit(user)}>Manage</button>{user.role === "student" && <button className="manage-qr-button" onClick={() => setQrUser(user)}>QR Code</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !saving && setEditing(null)}>
          <form className="user-modal" onSubmit={save} onClick={(event) => event.stopPropagation()}>
            <h2>{editing === "new" ? "Add New User" : "Manage User"}</h2>
            {editing === "new" && (
              <p className="user-invite-help">
                The user will receive a secure activation email to create their own password. Administrators never see or set the password.
              </p>
            )}
            {formError && <p className="form-error">{formError}</p>}
            {editing === "new" && (
              <label>Email<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            )}
            <label>Full name<input required maxLength="150" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
            <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="student">Student</option><option value="professor">Professor</option><option value="admin">Admin</option></select></label>
            {form.role === "student" && (
              <label>Student ID<input required maxLength="100" value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} /></label>
            )}
            <label className="user-active"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Account active</label>
            <div className="modal-actions">
              <button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? "Saving..." : editing === "new" ? "Send Account Invitation" : "Save Changes"}</button>
            </div>
          </form>
        </div>
      )}
      {qrUser && <QrManagementModal user={qrUser} onClose={() => setQrUser(null)} onUpdated={load} />}
      {printCards.length > 0 && <div className="physical-qr-print-sheet batch-print-sheet" aria-hidden="true">
        {printCards.map((card) => <article className="physical-qr-label" key={card.userId}><div className="print-brand">CTHM Stockroom</div><img src={card.image} alt="" /><strong>{card.fullName}</strong><span>{card.studentId}</span><small>{card.issuedAt ? `Issued ${new Date(card.issuedAt).toLocaleDateString()}` : "Not yet issued"}</small></article>)}
      </div>}
    </div>
  );
}
