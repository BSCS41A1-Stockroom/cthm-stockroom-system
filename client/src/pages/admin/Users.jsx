import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      await load();
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function openInvite() {
    setEditing("new");
    setForm(EMPTY_FORM);
    setFormError("");
  }

  return (
    <div className="users-page">
      <header>
        <h1>User Management</h1>
        <p>Invite users and manage their system roles and access.</p>
      </header>

      <div className="users-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, or student ID"
        />
        <button onClick={openInvite}>Invite User</button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="users-table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th><th>Role</th><th>Student ID</th><th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td><strong>{user.full_name}</strong><small>{user.email}</small></td>
                  <td>{user.role}</td>
                  <td>{user.student_id || "-"}</td>
                  <td>
                    <span className={`user-status ${user.is_active ? "active" : "inactive"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td><button onClick={() => edit(user)}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !saving && setEditing(null)}>
          <form className="user-modal" onSubmit={save} onClick={(event) => event.stopPropagation()}>
            <h2>{editing === "new" ? "Invite User" : "Manage User"}</h2>
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
              <button type="submit" disabled={saving}>{saving ? "Saving..." : editing === "new" ? "Send Invitation" : "Save Changes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
