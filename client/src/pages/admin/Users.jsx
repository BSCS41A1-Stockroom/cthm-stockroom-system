import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

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

const EMPTY_SECTION_FORM = {
    id: null,
    departmentId: "",
    name: "",
    isActive: true,
};

export default function Users() {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");

    const [form, setForm] =
        useState(EMPTY_FORM);

    const [editing, setEditing] =
        useState(null);

    const [error, setError] =
        useState("");

    const [formError, setFormError] =
        useState("");

    const [success, setSuccess] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [qrUser, setQrUser] =
        useState(null);

    const [selectedQrUsers, setSelectedQrUsers] =
        useState([]);

    const [printCards, setPrintCards] =
        useState([]);

    const [departments, setDepartments] =
        useState([]);

    const [sections, setSections] =
        useState([]);

    /*
     * =========================================================
     * SECTION MANAGEMENT
     * =========================================================
     */

    const [showSectionManager, setShowSectionManager] =
        useState(false);

    const [showSectionForm, setShowSectionForm] =
        useState(false);

    const [sectionForm, setSectionForm] =
        useState(EMPTY_SECTION_FORM);

    const [editingSection, setEditingSection] =
        useState(null);

    const [sectionSaving, setSectionSaving] =
        useState(false);

    const [sectionLoading, setSectionLoading] =
        useState(false);

    const loadSequence =
        useRef(0);

    /*
     * =========================================================
     * LOAD USERS
     * =========================================================
     */

    const load = useCallback(
        async () => {
            const sequence =
                ++loadSequence.current;

            setLoading(true);

            try {
                const response =
                    await authenticatedFetch(
                        `/api/users?search=${encodeURIComponent(
                            search
                        )}`
                    );

                const result =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        result.message ||
                            "Unable to load users."
                    );
                }

                if (
                    sequence ===
                    loadSequence.current
                ) {
                    setUsers(
                        result.users || []
                    );

                    setError("");
                }
            } catch (
                requestError
            ) {
                if (
                    sequence ===
                    loadSequence.current
                ) {
                    setError(
                        requestError.message
                    );
                }
            } finally {
                if (
                    sequence ===
                    loadSequence.current
                ) {
                    setLoading(false);
                }
            }
        },
        [search]
    );

    useEffect(() => {
        const timer =
            window.setTimeout(
                load,
                250
            );

        return () => {
            window.clearTimeout(
                timer
            );

            loadSequence.current += 1;
        };
    }, [load]);

    /*
     * =========================================================
     * LOAD DEPARTMENTS + SECTIONS
     * =========================================================
     */

    const loadAcademicAssignments =
        useCallback(
            async () => {
                try {
                    const response =
                        await authenticatedFetch(
                            "/api/borrowings/assignment-options"
                        );

                    const body =
                        await response.json();

                    if (!response.ok) {
                        throw new Error(
                            body.message ||
                                "Unable to load academic assignments."
                        );
                    }

                    setDepartments(
                        body.departments ||
                            []
                    );

                    setSections(
                        body.sections ||
                            []
                    );
                } catch (
                    requestError
                ) {
                    setError(
                        requestError.message ||
                            "Unable to load departments and sections."
                    );
                }
            },
            []
        );

    useEffect(() => {
        loadAcademicAssignments();
    }, [
        loadAcademicAssignments,
    ]);

    /*
     * =========================================================
     * LOAD SECTIONS DIRECTLY
     * =========================================================
     */

    const loadSections =
        useCallback(
            async () => {
                try {
                    setSectionLoading(
                        true
                    );

                    const response =
                        await authenticatedFetch(
                            "/api/sections"
                        );

                    const body =
                        await response.json();

                    if (!response.ok) {
                        throw new Error(
                            body.message ||
                                "Unable to load sections."
                        );
                    }

                    setSections(
                        body.sections ||
                            []
                    );
                } catch (
                    requestError
                ) {
                    setError(
                        requestError.message ||
                            "Unable to load sections."
                    );
                } finally {
                    setSectionLoading(
                        false
                    );
                }
            },
            []
        );

    /*
     * =========================================================
     * USER EDIT
     * =========================================================
     */

    function edit(user) {
        setEditing(user.user_id);

        setForm({
            email:
                user.email || "",
            fullName:
                user.full_name || "",
            role:
                user.role ||
                "student",
            studentId:
                user.student_id ||
                "",
            departmentId:
                user.department_id
                    ? String(
                          user.department_id
                      )
                    : "",
            sectionId:
                user.section_id
                    ? String(
                          user.section_id
                      )
                    : "",
            isActive:
                user.is_active !== false,
        });

        setFormError("");
        setSuccess("");
    }

    function openAddUser() {
        setEditing("new");
        setForm(EMPTY_FORM);
        setFormError("");
        setSuccess("");
    }

    function handleRoleChange(
        role
    ) {
        setForm(
            (current) => ({
                ...current,

                role,

                departmentId:
                    [
                        "professor",
                        "staff",
                        "department_head",
                    ].includes(role)
                        ? current.departmentId
                        : "",

                sectionId:
                    role ===
                    "professor"
                        ? current.sectionId
                        : "",
            })
        );
    }

    function handleDepartmentChange(
        departmentId
    ) {
        setForm(
            (current) => ({
                ...current,
                departmentId,

                /*
                 * Reset section whenever
                 * department changes.
                 */
                sectionId: "",
            })
        );
    }

    const availableSections =
        sections.filter(
            (section) =>
                String(
                    section.department_id
                ) ===
                    String(
                        form.departmentId
                    ) &&
                section.is_active !==
                    false
        );

    /*
     * =========================================================
     * SAVE USER
     * =========================================================
     */

    async function save(event) {
        event.preventDefault();

        setSaving(true);
        setFormError("");
        setSuccess("");

        try {
            if (
                form.role ===
                    "professor" &&
                !form.departmentId
            ) {
                throw new Error(
                    "Please select a department for the professor."
                );
            }

            if (
                form.role ===
                    "professor" &&
                !form.sectionId
            ) {
                throw new Error(
                    "Please select a section for the professor."
                );
            }

            const inviting =
                editing === "new";

            const path = inviting
                ? "/api/users/invite"
                : `/api/users/${editing}`;

            const payload = {
                ...form,

                departmentId:
                    [
                        "professor",
                        "staff",
                        "department_head",
                    ].includes(
                        form.role
                    )
                        ? form.departmentId
                        : null,

                sectionId:
                    form.role ===
                    "professor"
                        ? form.sectionId
                        : null,
            };

            const response =
                await authenticatedFetch(
                    path,
                    {
                        method: inviting
                            ? "POST"
                            : "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                payload
                            ),
                    }
                );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.reasons?.[0] ||
                        result.message ||
                        "Unable to save user."
                );
            }

            setEditing(null);
            setForm(
                EMPTY_FORM
            );

            setSuccess(
                inviting
                    ? "User added. A secure account activation email has been sent."
                    : "User account updated successfully."
            );

            await load();
        } catch (
            requestError
        ) {
            setFormError(
                requestError.message
            );
        } finally {
            setSaving(false);
        }
    }

    /*
     * =========================================================
     * SECTION MANAGER
     * =========================================================
     */

    async function openSectionManager() {
        setError("");
        setSuccess("");

        setShowSectionManager(
            true
        );

        await loadSections();
    }

    function closeSectionManager() {
        if (sectionSaving) {
            return;
        }

        setShowSectionManager(
            false
        );

        setShowSectionForm(
            false
        );

        setEditingSection(
            null
        );

        setSectionForm(
            EMPTY_SECTION_FORM
        );
    }

    function openAddSection() {
        setError("");
        setSuccess("");

        setEditingSection(
            null
        );

        setSectionForm({
            id: null,
            departmentId: "",
            name: "",
            isActive: true,
        });

        setShowSectionForm(
            true
        );
    }

    function openEditSection(
        section
    ) {
        setError("");
        setSuccess("");

        setEditingSection(
            section
        );

        setSectionForm({
            id: section.id,

            departmentId:
                section.department_id
                    ? String(
                          section.department_id
                      )
                    : "",

            name:
                section.name || "",

            isActive:
                section.is_active !==
                false,
        });

        setShowSectionForm(
            true
        );
    }

    function closeSectionForm() {
        if (sectionSaving) {
            return;
        }

        setShowSectionForm(
            false
        );

        setEditingSection(
            null
        );

        setSectionForm(
            EMPTY_SECTION_FORM
        );
    }

    function handleSectionChange(
        event
    ) {
        const {
            name,
            value,
            type,
            checked,
        } = event.target;

        setSectionForm(
            (current) => ({
                ...current,

                [name]:
                    type ===
                    "checkbox"
                        ? checked
                        : value,
            })
        );
    }

    /*
     * =========================================================
     * ADD / EDIT SECTION
     * =========================================================
     */

    async function saveSection(
        event
    ) {
        event.preventDefault();

        setSectionSaving(true);
        setError("");
        setSuccess("");

        try {
            const name =
                sectionForm.name.trim();

            if (
                !sectionForm.departmentId
            ) {
                throw new Error(
                    "Please select a department."
                );
            }

            if (!name) {
                throw new Error(
                    "Please enter a section name."
                );
            }

            if (name.length > 100) {
                throw new Error(
                    "Section name cannot exceed 100 characters."
                );
            }

            const editingExisting =
                Boolean(
                    editingSection
                );

            const path =
                editingExisting
                    ? `/api/sections/${editingSection.id}`
                    : "/api/sections";

            const response =
                await authenticatedFetch(
                    path,
                    {
                        method:
                            editingExisting
                                ? "PATCH"
                                : "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                departmentId:
                                    Number(
                                        sectionForm.departmentId
                                    ),

                                name,

                                isActive:
                                    sectionForm.isActive,
                            }),
                    }
                );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                        result.error ||
                        "Unable to save section."
                );
            }

            setSuccess(
                editingExisting
                    ? "Section updated successfully."
                    : "Section added successfully."
            );

            closeSectionForm();

            /*
             * Refresh both:
             *
             * 1. Section Manager
             * 2. Professor section dropdown
             */
            await loadSections();
            await loadAcademicAssignments();
        } catch (
            requestError
        ) {
            setError(
                requestError.message ||
                    "Unable to save section."
            );
        } finally {
            setSectionSaving(
                false
            );
        }
    }

    /*
     * =========================================================
     * ACTIVATE / DEACTIVATE SECTION
     * =========================================================
     */

    async function toggleSection(
        section
    ) {
        const activating =
            section.is_active ===
            false;

        const action =
            activating
                ? "activate"
                : "deactivate";

        const confirmed =
            window.confirm(
                `Are you sure you want to ${action} "${section.name}"?`
            );

        if (!confirmed) {
            return;
        }

        setError("");
        setSuccess("");

        try {
            const response =
                await authenticatedFetch(
                    `/api/sections/${section.id}`,
                    {
                        method:
                            "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                departmentId:
                                    Number(
                                        section.department_id
                                    ),

                                name:
                                    section.name,

                                isActive:
                                    activating,
                            }),
                    }
                );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                        result.error ||
                        `Unable to ${action} section.`
                );
            }

            setSuccess(
                activating
                    ? "Section activated successfully."
                    : "Section deactivated successfully."
            );

            await loadSections();
            await loadAcademicAssignments();
        } catch (
            requestError
        ) {
            setError(
                requestError.message ||
                    `Unable to ${action} section.`
            );
        }
    }

    /*
     * =========================================================
     * DELETE SECTION
     * =========================================================
     */

    async function deleteSection(
        section
    ) {
        const confirmed =
            window.confirm(
                `Delete "${section.name}" permanently?\n\nThis action cannot be undone.`
            );

        if (!confirmed) {
            return;
        }

        setError("");
        setSuccess("");

        try {
            const response =
                await authenticatedFetch(
                    `/api/sections/${section.id}`,
                    {
                        method:
                            "DELETE",
                    }
                );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                        result.error ||
                        "Unable to delete section."
                );
            }

            setSuccess(
                "Section deleted successfully."
            );

            await loadSections();
            await loadAcademicAssignments();
        } catch (
            requestError
        ) {
            setError(
                requestError.message ||
                    "Unable to delete section."
            );
        }
    }

    /*
     * =========================================================
     * QR FUNCTIONS
     * =========================================================
     */

    function toggleQrUser(
        userId
    ) {
        setSelectedQrUsers(
            (current) =>
                current.includes(userId)
                    ? current.filter(
                          (id) =>
                              id !==
                              userId
                      )
                    : [
                          ...current,
                          userId,
                      ]
        );
    }

    async function printSelectedQrCodes() {
        if (
            !selectedQrUsers.length ||
            saving
        ) {
            return;
        }

        setSaving(true);
        setError("");

        try {
            const selected =
                users.filter(
                    (user) =>
                        selectedQrUsers.includes(
                            user.user_id
                        ) &&
                        user.role ===
                            "student"
                );

            const records =
                await Promise.all(
                    selected.map(
                        async (user) => {
                            const response =
                                await authenticatedFetch(
                                    `/api/qr/users/${user.user_id}`
                                );

                            const body =
                                await response.json();

                            if (
                                !response.ok
                            ) {
                                throw new Error(
                                    body.message ||
                                        `Unable to load QR for ${user.full_name}.`
                                );
                            }

                            if (
                                !body.token
                            ) {
                                return null;
                            }

                            const printed =
                                await authenticatedFetch(
                                    `/api/qr/users/${user.user_id}/print`,
                                    {
                                        method:
                                            "POST",
                                    }
                                );

                            const printedBody =
                                await printed.json();

                            if (
                                !printed.ok
                            ) {
                                throw new Error(
                                    printedBody.message ||
                                        `Unable to prepare QR for ${user.full_name}.`
                                );
                            }

                            return {
                                ...printedBody,

                                image:
                                    await QRCode.toDataURL(
                                        printedBody.token,
                                        {
                                            width: 360,
                                            margin: 2,
                                            errorCorrectionLevel:
                                                "M",
                                        }
                                    ),
                            };
                        }
                    )
                );

            const printable =
                records.filter(
                    Boolean
                );

            if (
                !printable.length
            ) {
                throw new Error(
                    "The selected students do not have printable QR codes. Generate replacements for revoked codes first."
                );
            }

            setPrintCards(
                printable
            );

            window.addEventListener(
                "afterprint",
                () =>
                    setPrintCards(
                        []
                    ),
                {
                    once: true,
                }
            );

            window.setTimeout(
                () =>
                    window.print(),
                0
            );

            await load();
        } catch (
            requestError
        ) {
            setError(
                requestError.message
            );
        } finally {
            setSaving(false);
        }
    }

    /*
     * =========================================================
     * RENDER
     * =========================================================
     */

    return (
        <div className="users-page">

            <header>
                <h1>
                    User Management
                </h1>

                <p>
                    Add users through secure
                    email activation and
                    manage their roles,
                    departments, sections,
                    and access.
                </p>
            </header>

            <div className="users-toolbar">

                <input
                    value={search}
                    onChange={(event) =>
                        setSearch(
                            event.target
                                .value
                        )
                    }
                    placeholder="Search name, email, student ID, or section"
                />

                <button
                    onClick={
                        openAddUser
                    }
                >
                    Add User
                </button>

                <button
                    className="section-manager-button"
                    onClick={
                        openSectionManager
                    }
                >
                    Manage Sections
                </button>

                <button
                    className="qr-batch-button"
                    disabled={
                        !selectedQrUsers.length ||
                        saving
                    }
                    onClick={
                        printSelectedQrCodes
                    }
                >
                    Print Selected QR (
                    {
                        selectedQrUsers.length
                    }
                    )
                </button>

            </div>

            {success && (
                <p
                    className="form-success"
                    role="status"
                >
                    {success}
                </p>
            )}

            {error && (
                <p className="form-error">
                    {error}
                </p>
            )}

            {loading ? (
                <p>
                    Loading users...
                </p>
            ) : (
                <div className="users-table-wrap">
                    <table>

                        <thead>
                            <tr>

                                <th
                                    className="qr-select-column"
                                    aria-label="Select QR labels"
                                />

                                <th>
                                    User
                                </th>

                                <th>
                                    Role
                                </th>

                                <th>
                                    Department
                                </th>

                                <th>
                                    Section
                                </th>

                                <th>
                                    Student ID
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    QR Status
                                </th>

                                <th
                                    aria-label="Actions"
                                />

                            </tr>
                        </thead>

                        <tbody>

                            {users.map(
                                (user) => (
                                    <tr
                                        key={
                                            user.user_id
                                        }
                                    >

                                        <td>
                                            {user.role ===
                                                "student" && (
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

                                        <td>
                                            <strong>
                                                {
                                                    user.full_name
                                                }
                                            </strong>

                                            <small>
                                                {
                                                    user.email
                                                }
                                            </small>
                                        </td>

                                        <td>
                                            {
                                                user.role
                                            }
                                        </td>

                                        <td>
                                            {
                                                user.department_name ||
                                                    "-"
                                            }
                                        </td>

                                        <td>
                                            {user.role ===
                                                "professor" &&
                                            user.section_name
                                                ? user.section_name
                                                : "-"}
                                        </td>

                                        <td>
                                            {
                                                user.student_id ||
                                                    "-"
                                            }
                                        </td>

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

                                        <td>
                                            {user.role ===
                                            "student" ? (
                                                <span
                                                    className={`qr-status ${
                                                        user.qr_status ||
                                                        "not_issued"
                                                    }`}
                                                >
                                                    {
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
                                                    }
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </td>

                                        <td>
                                            <div className="user-row-actions">

                                                <button
                                                    onClick={() =>
                                                        edit(
                                                            user
                                                        )
                                                    }
                                                >
                                                    Manage
                                                </button>

                                                {user.role ===
                                                    "student" && (
                                                    <button
                                                        className="manage-qr-button"
                                                        onClick={() =>
                                                            setQrUser(
                                                                user
                                                            )
                                                        }
                                                    >
                                                        QR Code
                                                    </button>
                                                )}

                                            </div>
                                        </td>

                                    </tr>
                                )
                            )}

                        </tbody>

                    </table>
                </div>
            )}

            {/*
             * =================================================
             * USER MODAL
             * =================================================
             */}

            {editing && (
                <div
                    className="modal-overlay"
                    onClick={() =>
                        !saving &&
                        setEditing(
                            null
                        )
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
                            {editing ===
                            "new"
                                ? "Add New User"
                                : "Manage User"}
                        </h2>

                        {editing ===
                            "new" && (
                            <p className="user-invite-help">
                                The user will
                                receive a
                                secure
                                activation
                                email to
                                create
                                their own
                                password.
                                Administrators
                                never see
                                or set the
                                password.
                            </p>
                        )}

                        {formError && (
                            <p className="form-error">
                                {
                                    formError
                                }
                            </p>
                        )}

                        {editing ===
                            "new" && (
                            <label>
                                Email

                                <input
                                    type="email"
                                    required
                                    value={
                                        form.email
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setForm(
                                            {
                                                ...form,
                                                email: event
                                                    .target
                                                    .value,
                                            }
                                        )
                                    }
                                />
                            </label>
                        )}

                        <label>
                            Full name

                            <input
                                required
                                maxLength={
                                    150
                                }
                                value={
                                    form.fullName
                                }
                                onChange={(
                                    event
                                ) =>
                                    setForm(
                                        {
                                            ...form,
                                            fullName:
                                                event
                                                    .target
                                                    .value,
                                        }
                                    )
                                }
                            />
                        </label>

                        <label>
                            Role

                            <select
                                value={
                                    form.role
                                }
                                onChange={(
                                    event
                                ) =>
                                    handleRoleChange(
                                        event
                                            .target
                                            .value
                                    )
                                }
                            >
                                <option value="student">
                                    Student
                                </option>

                                <option value="professor">
                                    Professor
                                </option>

                                <option value="staff">
                                    Department
                                    Staff
                                </option>

                                <option value="department_head">
                                    Department
                                    Head
                                </option>

                                <option value="admin">
                                    General
                                    Administrator
                                </option>
                            </select>
                        </label>

                        {form.role ===
                            "student" && (
                            <label>
                                Student ID

                                <input
                                    required
                                    maxLength={
                                        100
                                    }
                                    value={
                                        form.studentId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setForm(
                                            {
                                                ...form,
                                                studentId:
                                                    event
                                                        .target
                                                        .value,
                                            }
                                        )
                                    }
                                />
                            </label>
                        )}

                        {[
                            "professor",
                            "staff",
                            "department_head",
                        ].includes(
                            form.role
                        ) && (
                            <label>
                                Department

                                <select
                                    required
                                    value={
                                        form.departmentId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        handleDepartmentChange(
                                            event
                                                .target
                                                .value
                                        )
                                    }
                                >
                                    <option value="">
                                        Select
                                        department
                                    </option>

                                    {departments.map(
                                        (
                                            department
                                        ) => (
                                            <option
                                                key={
                                                    department.id
                                                }
                                                value={
                                                    department.id
                                                }
                                            >
                                                {
                                                    department.code
                                                }{" "}
                                                —
                                                {
                                                    department.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>
                        )}

                        {form.role ===
                            "professor" && (
                            <label>
                                Section

                                <select
                                    required
                                    value={
                                        form.sectionId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setForm(
                                            {
                                                ...form,
                                                sectionId:
                                                    event
                                                        .target
                                                        .value,
                                            }
                                        )
                                    }
                                    disabled={
                                        !form.departmentId
                                    }
                                >
                                    <option value="">
                                        {!form.departmentId
                                            ? "Select department first"
                                            : availableSections.length
                                            ? "Select section"
                                            : "No sections available"}
                                    </option>

                                    {availableSections.map(
                                        (
                                            section
                                        ) => (
                                            <option
                                                key={
                                                    section.id
                                                }
                                                value={
                                                    section.id
                                                }
                                            >
                                                {
                                                    section.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>

                                {form.departmentId &&
                                    availableSections.length ===
                                        0 && (
                                        <small className="user-field-help">
                                            No active
                                            sections
                                            are
                                            available
                                            for this
                                            department
                                            yet.
                                        </small>
                                    )}
                            </label>
                        )}

                        <label className="user-active">

                            <input
                                type="checkbox"
                                checked={
                                    form.isActive
                                }
                                onChange={(
                                    event
                                ) =>
                                    setForm(
                                        {
                                            ...form,
                                            isActive:
                                                event
                                                    .target
                                                    .checked,
                                        }
                                    )
                                }
                            />

                            Account active
                        </label>

                        <div className="modal-actions">

                            <button
                                type="button"
                                disabled={
                                    saving
                                }
                                onClick={() =>
                                    setEditing(
                                        null
                                    )
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    saving
                                }
                            >
                                {saving
                                    ? "Saving..."
                                    : editing ===
                                      "new"
                                    ? "Send Account Invitation"
                                    : "Save Changes"}
                            </button>

                        </div>

                    </form>
                </div>
            )}

            {/*
             * =================================================
             * SECTION MANAGER
             * =================================================
             */}

            {showSectionManager && (
                <div
                    className="modal-overlay section-manager-overlay"
                    onClick={
                        closeSectionManager
                    }
                >

                    <div
                        className="section-manager-modal"
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="section-manager-header">

                            <div>
                                <h2>
                                    Manage Sections
                                </h2>

                                <p>
                                    Manage academic
                                    sections by
                                    department.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="section-close-button"
                                onClick={
                                    closeSectionManager
                                }
                            >
                                ×
                            </button>

                        </div>

                        <div className="section-manager-toolbar">

                            <button
                                type="button"
                                className="section-add-button"
                                onClick={
                                    openAddSection
                                }
                            >
                                + Add Section
                            </button>

                        </div>

                        {sectionLoading ? (
                            <div className="section-empty">
                                Loading sections...
                            </div>
                        ) : (
                            <div className="section-table-wrap">

                                <table>

                                    <thead>
                                        <tr>
                                            <th>
                                                Department
                                            </th>

                                            <th>
                                                Section
                                            </th>

                                            <th>
                                                Status
                                            </th>

                                            <th>
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {sections.length ===
                                        0 ? (
                                            <tr>
                                                <td
                                                    colSpan="4"
                                                    className="section-empty"
                                                >
                                                    No sections
                                                    found.
                                                </td>
                                            </tr>
                                        ) : (
                                            sections.map(
                                                (
                                                    section
                                                ) => (
                                                    <tr
                                                        key={
                                                            section.id
                                                        }
                                                    >

                                                        <td>
                                                            <strong>
                                                                {
                                                                    section.department_code
                                                                }
                                                            </strong>

                                                            <small>
                                                                {
                                                                    section.department_name
                                                                }
                                                            </small>
                                                        </td>

                                                        <td>
                                                            <strong className="section-name">
                                                                {
                                                                    section.name
                                                                }
                                                            </strong>
                                                        </td>

                                                        <td>
                                                            <span
                                                                className={`section-status ${
                                                                    section.is_active
                                                                        ? "active"
                                                                        : "inactive"
                                                                }`}
                                                            >
                                                                {section.is_active
                                                                    ? "Active"
                                                                    : "Inactive"}
                                                            </span>
                                                        </td>

                                                        <td>
                                                            <div className="section-row-actions">

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        openEditSection(
                                                                            section
                                                                        )
                                                                    }
                                                                >
                                                                    Edit
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleSection(
                                                                            section
                                                                        )
                                                                    }
                                                                >
                                                                    {section.is_active
                                                                        ? "Deactivate"
                                                                        : "Activate"}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="section-delete-button"
                                                                    onClick={() =>
                                                                        deleteSection(
                                                                            section
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                </button>

                                                            </div>
                                                        </td>

                                                    </tr>
                                                )
                                            )
                                        )}

                                    </tbody>

                                </table>

                            </div>
                        )}

                    </div>
                </div>
            )}

            {/*
             * =================================================
             * ADD / EDIT SECTION MODAL
             * =================================================
             */}

            {showSectionForm && (
                <div
                    className="modal-overlay section-form-overlay"
                    onClick={() =>
                        !sectionSaving &&
                        closeSectionForm()
                    }
                >

                    <form
                        className="section-form-modal"
                        onSubmit={
                            saveSection
                        }
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="section-form-header">

                            <div>
                                <h2>
                                    {editingSection
                                        ? "Edit Section"
                                        : "Add Section"}
                                </h2>

                                <p>
                                    Set the
                                    department
                                    and section
                                    name.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="section-close-button"
                                onClick={
                                    closeSectionForm
                                }
                                disabled={
                                    sectionSaving
                                }
                            >
                                ×
                            </button>

                        </div>

                        <label>
                            Department

                            <select
                                name="departmentId"
                                required
                                value={
                                    sectionForm.departmentId
                                }
                                onChange={
                                    handleSectionChange
                                }
                            >
                                <option value="">
                                    Select department
                                </option>

                                {departments.map(
                                    (
                                        department
                                    ) => (
                                        <option
                                            key={
                                                department.id
                                            }
                                            value={
                                                department.id
                                            }
                                        >
                                            {
                                                department.code
                                            }{" "}
                                            —
                                            {
                                                department.name
                                            }
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label>
                            Section Name

                            <input
                                name="name"
                                required
                                maxLength={
                                    100
                                }
                                value={
                                    sectionForm.name
                                }
                                onChange={
                                    handleSectionChange
                                }
                                placeholder="e.g. 2A"
                            />
                        </label>

                        <label className="section-active-field">

                            <input
                                type="checkbox"
                                name="isActive"
                                checked={
                                    sectionForm.isActive
                                }
                                onChange={
                                    handleSectionChange
                                }
                            />

                            Section active

                        </label>

                        <div className="section-form-actions">

                            <button
                                type="button"
                                onClick={
                                    closeSectionForm
                                }
                                disabled={
                                    sectionSaving
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    sectionSaving
                                }
                            >
                                {sectionSaving
                                    ? "Saving..."
                                    : editingSection
                                    ? "Save Changes"
                                    : "Add Section"}
                            </button>

                        </div>

                    </form>
                </div>
            )}

            {qrUser && (
                <QrManagementModal
                    user={qrUser}
                    onClose={() =>
                        setQrUser(null)
                    }
                    onUpdated={
                        load
                    }
                />
            )}

            {printCards.length >
                0 && (
                <div
                    className="physical-qr-print-sheet batch-print-sheet"
                    aria-hidden="true"
                >
                    {printCards.map(
                        (card) => (
                            <article
                                className="physical-qr-label"
                                key={
                                    card.userId
                                }
                            >
                                <div className="print-brand">
                                    CTHM
                                    Stockroom
                                </div>

                                <img
                                    src={
                                        card.image
                                    }
                                    alt=""
                                />

                                <strong>
                                    {
                                        card.fullName
                                    }
                                </strong>

                                <span>
                                    {
                                        card.studentId
                                    }
                                </span>

                                <small>
                                    {card.issuedAt
                                        ? `Issued ${new Date(
                                              card.issuedAt
                                          ).toLocaleDateString()}`
                                        : "Not yet issued"}
                                </small>
                            </article>
                        )
                    )}
                </div>
            )}

        </div>
    );
}
