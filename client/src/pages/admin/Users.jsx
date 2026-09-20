
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
  departmentId: "",
  sectionId: "",
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

  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);

  const loadSequence = useRef(0);

  /*
   * ---------------------------------------------------------
   * LOAD USERS
   * ---------------------------------------------------------
   */

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;

    setLoading(true);

    try {
      const response = await authenticatedFetch(
        `/api/users?search=${encodeURIComponent(search)}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load users."
        );
      }

      if (sequence === loadSequence.current) {
        setUsers(result.users || []);
        setError("");
      }
    } catch (requestError) {
      if (sequence === loadSequence.current) {
        setError(
          requestError.message || "Unable to load users."
        );
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
      }
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);

    return () => {
      window.clearTimeout(timer);
      loadSequence.current += 1;
    };
  }, [load]);

  /*
   * ---------------------------------------------------------
   * LOAD DEPARTMENTS + SECTIONS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    async function loadAssignmentOptions() {
      try {
        const response = await authenticatedFetch(
          "/api/borrowings/assignment-options"
        );

        const body = await response.json();

        if (!response.ok) {
          throw new Error(
            body.message ||
              "Unable to load departments and sections."
          );
        }

        setDepartments(body.departments || []);
        setSections(body.sections || []);
      } catch (requestError) {
        setError(
          requestError.message ||
            "Unable to load departments and sections."
        );
      }
    }

    loadAssignmentOptions();
  }, []);

  /*
   * ---------------------------------------------------------
   * FILTER SECTIONS BY DEPARTMENT
   * ---------------------------------------------------------
   */

  const professorSections = sections.filter((section) => {
    if (!form.departmentId) {
      return false;
    }

    return (
      String(section.department_id) ===
      String(form.departmentId)
    );
  });

  /*
   * ---------------------------------------------------------
   * EDIT USER
   * ---------------------------------------------------------
   */

  function edit(user) {
    setEditing(user.user_id);

    setForm({
      email: user.email || "",
      fullName: user.full_name || "",
      role: user.role || "student",
      studentId: user.student_id || "",
      departmentId: user.department_id || "",
      sectionId: user.section_id || "",
      isActive:
        user.is_active === undefined
          ? true
          : user.is_active,
    });

    setFormError("");
    setError("");
    setSuccess("");
  }

  /*
   * ---------------------------------------------------------
   * FORM FIELD HANDLERS
   * ---------------------------------------------------------
   */

  function handleRoleChange(event) {
    const role = event.target.value;

    setForm((current) => ({
      ...current,
      role,

      // Students don't need professor assignment here.
      // Staff and professors use department.
      departmentId: ["professor", "staff"].includes(role)
        ? current.departmentId
        : "",

      // Only professors use section assignment.
      sectionId:
        role === "professor"
          ? current.sectionId
          : "",
    }));

    setFormError("");
  }

  function handleDepartmentChange(event) {
    const departmentId = event.target.value;

    setForm((current) => ({
      ...current,
      departmentId,

      // Reset section whenever department changes.
      sectionId: "",
    }));

    setFormError("");
  }

  /*
   * ---------------------------------------------------------
   * SAVE USER
   * ---------------------------------------------------------
   */

  async function save(event) {
    event.preventDefault();

    setSaving(true);
    setFormError("");
    setError("");
    setSuccess("");

    try {
      const inviting = editing === "new";

      /*
       * Professor must have a section.
       */
      if (
        form.role === "professor" &&
        !form.sectionId
      ) {
        throw new Error(
          "Please select the professor's section."
        );
      }

      /*
       * Professor/staff must have a department.
       */
      if (
        ["professor", "staff"].includes(form.role) &&
        !form.departmentId
      ) {
        throw new Error(
          "Please select the department."
        );
      }

      const path = inviting
        ? "/api/users/invite"
        : `/api/users/${editing}`;

      const payload = {
        ...form,

        /*
         * Keep sectionId explicit so the backend receives it.
         */
        sectionId:
          form.role === "professor"
            ? form.sectionId || null
            : null,
      };

      const response = await authenticatedFetch(path, {
        method: inviting ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.reasons?.[0] ||
            result.message ||
            "Unable to save user."
        );
      }

      setEditing(null);
      setForm(EMPTY_FORM);

      setSuccess(
        inviting
          ? "User added. A secure account activation email has been sent."
          : "User account updated successfully."
      );

      await load();
    } catch (requestError) {
      setFormError(
        requestError.message ||
          "Unable to save user."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * ADD USER
   * ---------------------------------------------------------
   */

  function openAddUser() {
    setEditing("new");
    setForm(EMPTY_FORM);
    setFormError("");
    setError("");
    setSuccess("");
  }

  /*
   * ---------------------------------------------------------
   * QR SELECTION
   * ---------------------------------------------------------
   */

  function toggleQrUser(userId) {
    setSelectedQrUsers((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }

  /*
   * ---------------------------------------------------------
   * PRINT SELECTED QR CODES
   * ---------------------------------------------------------
   */

  async function printSelectedQrCodes() {
    if (!selectedQrUsers.length || saving) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const selected = users.filter(
        (user) =>
          selectedQrUsers.includes(user.user_id) &&
          user.role === "student"
      );

      const records = await Promise.all(
        selected.map(async (user) => {
          const response =
            await authenticatedFetch(
              `/api/qr/users/${user.user_id}`
            );

          const body = await response.json();

          if (!response.ok) {
            throw new Error(
              body.message ||
                `Unable to load QR for ${user.full_name}.`
            );
          }

          if (!body.token) {
            return null;
          }

          const printed =
            await authenticatedFetch(
              `/api/qr/users/${user.user_id}/print`,
              {
                method: "POST",
              }
            );

          const printedBody =
            await printed.json();

          if (!printed.ok) {
            throw new Error(
              printedBody.message ||
                `Unable to prepare QR for ${user.full_name}.`
            );
          }

          return {
            ...printedBody,

            image: await QRCode.toDataURL(
              printedBody.token,
              {
                width: 360,
                margin: 2,
                errorCorrectionLevel: "M",
              }
            ),
          };
        })
      );

      const printable =
        records.filter(Boolean);

      if (!printable.length) {
        throw new Error(
          "The selected students do not have printable QR codes. Generate replacements for revoked codes first."
        );
      }

      setPrintCards(printable);

      window.addEventListener(
        "afterprint",
        () => setPrintCards([]),
        { once: true }
      );

      window.setTimeout(
        () => window.print(),
        0
      );

      await load();
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to print QR codes."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <div className="users-page">

      {/* PAGE HEADER */}
      <header>
        <h1>User Management</h1>

        <p>
          Add users through secure email activation
          and manage their roles and access.
        </p>
      </header>

      {/* TOOLBAR */}
      <div className="users-toolbar">

        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search name, email, or student ID"
        />

        <button onClick={openAddUser}>
          Add User
        </button>

        <button
          className="qr-batch-button"
          disabled={
            !selectedQrUsers.length || saving
          }
          onClick={printSelectedQrCodes}
        >
          Print Selected QR (
          {selectedQrUsers.length}
          )
        </button>

      </div>

      {/* SUCCESS */}
      {success && (
        <p
          className="form-success"
          role="status"
        >
          {success}
        </p>
      )}

      {/* ERROR */}
      {error && (
        <p className="form-error">
          {error}
        </p>
      )}

      {/* USERS TABLE */}
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="users-table-wrap">

          <table>

            <thead>
              <tr>

                <th
                  className="qr-select-column"
                  aria-label="Select QR labels"
                />

                <th>User</th>

                <th>Role</th>

                <th>Department</th>

                <th>Section</th>

                <th>Student ID</th>

                <th>Status</th>

                <th>QR Status</th>

                <th aria-label="Actions" />

              </tr>
            </thead>

            <tbody>

              {users.map((user) => (
                <tr key={user.user_id}>

                  {/* QR SELECT */}
                  <td>
                    {user.role === "student" && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${user.full_name} QR`}
                        checked={selectedQrUsers.includes(
                          user.user_id
                        )}
                        onChange={() =>
                          toggleQrUser(
                            user.user_id
                          )
                        }
                      />
                    )}
                  </td>

                  {/* USER */}
                  <td>
                    <strong>
                      {user.full_name}
                    </strong>

                    <small>
                      {user.email}
                    </small>
                  </td>

                  {/* ROLE */}
                  <td>
                    {user.role}
                  </td>

                  {/* DEPARTMENT */}
                  <td>
                    {user.department_name || "-"}
                  </td>

                  {/* SECTION */}
                  <td>
                    {user.section_name ||
                      user.section_code ||
                      "-"}
                  </td>

                  {/* STUDENT ID */}
                  <td>
                    {user.student_id || "-"}
                  </td>

                  {/* STATUS */}
                  <td>
                    <span
                      className={`user-status ${
                        user.is_active
                          ? "active"
                          : "inactive"
                      }`}
                    >
                      {user.is_active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </td>

                  {/* QR STATUS */}
                  <td>
                    {user.role === "student" ? (
                      <span
                        className={`qr-status ${
                          user.qr_status ||
                          "not_issued"
                        }`}
                      >
                        {(
                          {
                            not_issued:
                              "Not Issued",
                            active:
                              "Active",
                            revoked:
                              "Revoked",
                            replacement_required:
                              "Replacement Required",
                          }[
                            user.qr_status
                          ] ||
                          "Not Issued"
                        )}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>

                  {/* ACTIONS */}
                  <td>
                    <div className="user-row-actions">

                      <button
                        onClick={() =>
                          edit(user)
                        }
                      >
                        Manage
                      </button>

                      {user.role ===
                        "student" && (
                        <button
                          className="manage-qr-button"
                          onClick={() =>
                            setQrUser(user)
                          }
                        >
                          QR Code
                        </button>
                      )}

                    </div>
                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>
      )}

      {/* =====================================================
          USER MODAL
          ===================================================== */}

      {editing && (
        <div
          className="modal-overlay"
          onClick={() =>
            !saving &&
            setEditing(null)
          }
        >

          <form
            className="user-modal"
            onSubmit={save}
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <h2>
              {editing === "new"
                ? "Add New User"
                : "Manage User"}
            </h2>

            {/* INVITATION HELP */}
            {editing === "new" && (
              <p className="user-invite-help">
                The user will receive a secure
                activation email to create their
                own password. Administrators
                never see or set the password.
              </p>
            )}

            {/* FORM ERROR */}
            {formError && (
              <p className="form-error">
                {formError}
              </p>
            )}

            {/* EMAIL */}
            {editing === "new" && (
              <label>
                Email

                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email:
                        event.target.value,
                    })
                  }
                />
              </label>
            )}

            {/* FULL NAME */}
            <label>
              Full name

              <input
                required
                maxLength={150}
                value={form.fullName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    fullName:
                      event.target.value,
                  })
                }
              />
            </label>

            {/* ROLE */}
            <label>
              Role

              <select
                value={form.role}
                onChange={handleRoleChange}
              >
                <option value="student">
                  Student
                </option>

                <option value="professor">
                  Professor
                </option>

                <option value="staff">
                  Department Staff
                </option>

                <option value="admin">
                  General Administrator
                </option>
              </select>
            </label>

            {/* STUDENT ID */}
            {form.role === "student" && (
              <label>
                Student ID

                <input
                  required
                  maxLength={100}
                  value={form.studentId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      studentId:
                        event.target.value,
                    })
                  }
                />
              </label>
            )}

            {/* DEPARTMENT */}
            {["professor", "staff"].includes(
              form.role
            ) && (
              <label>
                Department

                <select
                  required
                  value={form.departmentId}
                  onChange={
                    handleDepartmentChange
                  }
                >

                  <option value="">
                    Select department
                  </option>

                  {departments.map(
                    (department) => (
                      <option
                        key={department.id}
                        value={department.id}
                      >
                        {department.code} —{" "}
                        {department.name}
                      </option>
                    )
                  )}

                </select>
              </label>
            )}

            {/* =================================================
                PROFESSOR SECTION
                ================================================= */}

            {form.role === "professor" && (
              <label>
                Section

                <select
                  required
                  value={form.sectionId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sectionId:
                        event.target.value,
                    })
                  }
                  disabled={!form.departmentId}
                >

                  <option value="">
                    {!form.departmentId
                      ? "Select department first"
                      : professorSections.length
                      ? "Select section"
                      : "No sections available"}
                  </option>

                  {professorSections.map(
                    (section) => (
                      <option
                        key={section.id}
                        value={section.id}
                      >
                        {section.code
                          ? `${section.code} — ${section.name}`
                          : section.name}
                      </option>
                    )
                  )}

                </select>

                {!form.departmentId && (
                  <small>
                    Select the professor's
                    department first.
                  </small>
                )}

                {form.departmentId &&
                  professorSections.length ===
                    0 && (
                    <small>
                      No sections are currently
                      assigned to this department.
                    </small>
                  )}
              </label>
            )}

            {/* ACTIVE */}
            <label className="user-active">

              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm({
                    ...form,
                    isActive:
                      event.target.checked,
                  })
                }
              />

              Account active

            </label>

            {/* ACTIONS */}
            <div className="modal-actions">

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setEditing(null)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editing === "new"
                  ? "Send Account Invitation"
                  : "Save Changes"}
              </button>

            </div>

          </form>

        </div>
      )}

      {/* QR MANAGEMENT */}
      {qrUser && (
        <QrManagementModal
          user={qrUser}
          onClose={() =>
            setQrUser(null)
          }
          onUpdated={load}
        />
      )}

      {/* PRINT SHEET */}
      {printCards.length > 0 && (
        <div
          className="physical-qr-print-sheet batch-print-sheet"
          aria-hidden="true"
        >

          {printCards.map((card) => (
            <article
              className="physical-qr-label"
              key={card.userId}
            >

              <div className="print-brand">
                CTHM Stockroom
              </div>

              <img
                src={card.image}
                alt=""
              />

              <strong>
                {card.fullName}
              </strong>

              <span>
                {card.studentId}
              </span>

              <small>
                {card.issuedAt
                  ? `Issued ${new Date(
                      card.issuedAt
                    ).toLocaleDateString()}`
                  : "Not yet issued"}
              </small>

            </article>
          ))}

        </div>
      )}

    </div>
  );
}
