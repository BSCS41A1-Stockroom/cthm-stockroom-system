import { useMemo, useState } from "react";
import {
    FaSearch,
    FaClipboardList,
    FaEye,
    FaCheck,
    FaTimes,
    FaUser,
    FaCalendarAlt,
    FaClock,
    FaMapMarkerAlt,
    FaBoxOpen,
} from "react-icons/fa";

import "../../styles/professor.css";

const SAMPLE_REQUESTS = [
    {
        id: 1,
        student: "Juan Dela Cruz",
        studentId: "2024-00125",
        program: "BS Hospitality Management",
        activity: "Food & Beverage Laboratory",
        date: "September 20, 2026",
        time: "9:00 AM – 11:00 AM",
        room: "CTHM Laboratory",
        submitted: "September 18, 2026",
        items: [
            {
                name: "Bar Glass",
                quantity: 2,
            },
            {
                name: "Cocktail Shaker",
                quantity: 1,
            },
            {
                name: "Dinner Plate",
                quantity: 5,
            },
        ],
        status: "Pending",
    },
    {
        id: 2,
        student: "Maria Santos",
        studentId: "2024-00318",
        program: "BS Hospitality Management",
        activity: "Housekeeping Laboratory",
        date: "September 21, 2026",
        time: "1:00 PM – 3:00 PM",
        room: "CTHM Laboratory",
        submitted: "September 18, 2026",
        items: [
            {
                name: "Bed Sheet",
                quantity: 4,
            },
            {
                name: "Pillow Case",
                quantity: 4,
            },
        ],
        status: "Pending",
    },
    {
        id: 3,
        student: "Pedro Reyes",
        studentId: "2024-00401",
        program: "BS Tourism Management",
        activity: "Bar Service Laboratory",
        date: "September 22, 2026",
        time: "10:00 AM – 12:00 PM",
        room: "CTHM Laboratory",
        submitted: "September 18, 2026",
        items: [
            {
                name: "Wine Glass",
                quantity: 6,
            },
            {
                name: "Bar Spoon",
                quantity: 2,
            },
        ],
        status: "Pending",
    },
];

export default function PendingRequests() {
    const [requests, setRequests] =
        useState(SAMPLE_REQUESTS);

    const [search, setSearch] = useState("");
    const [selectedRequest, setSelectedRequest] =
        useState(null);

    const filteredRequests = useMemo(() => {
        const query = search
            .trim()
            .toLowerCase();

        if (!query) {
            return requests;
        }

        return requests.filter((request) =>
            [
                request.student,
                request.studentId,
                request.program,
                request.activity,
            ]
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
    }, [requests, search]);

    const handleApprove = (request) => {
        setRequests((current) =>
            current.map((item) =>
                item.id === request.id
                    ? {
                          ...item,
                          status: "Approved",
                      }
                    : item
            )
        );

        setSelectedRequest(null);
    };

    const handleReject = (request) => {
        setRequests((current) =>
            current.map((item) =>
                item.id === request.id
                    ? {
                          ...item,
                          status: "Rejected",
                      }
                    : item
            )
        );

        setSelectedRequest(null);
    };

    const pendingCount = requests.filter(
        (request) =>
            request.status === "Pending"
    ).length;

    return (
        <div className="professor-requests-page">

            {/* =================================================
                HEADER
            ================================================= */}

            <div className="professor-page-header">

                <div>
                    <div className="professor-page-eyebrow">
                        PROFESSOR PORTAL
                    </div>

                    <h1>
                        Pending Requests
                    </h1>

                    <p>
                        Review student borrowing requests
                        that require your confirmation.
                    </p>
                </div>

            </div>


            {/* =================================================
                SUMMARY
            ================================================= */}

            <div className="professor-request-summary">

                <div className="professor-request-summary-card">

                    <div className="professor-summary-icon">
                        <FaClipboardList />
                    </div>

                    <div>
                        <span>
                            Pending Review
                        </span>

                        <strong>
                            {pendingCount}
                        </strong>
                    </div>

                </div>

                <div className="professor-request-summary-text">
                    {pendingCount === 0
                        ? "There are no student requests waiting for your confirmation."
                        : `${pendingCount} ${
                              pendingCount === 1
                                  ? "student request is"
                                  : "student requests are"
                          } waiting for your confirmation.`}
                </div>

            </div>


            {/* =================================================
                SEARCH
            ================================================= */}

            <div className="professor-request-toolbar">

                <div className="professor-request-search">

                    <FaSearch />

                    <input
                        type="text"
                        placeholder="Search student, activity, or student ID..."
                        value={search}
                        onChange={(event) =>
                            setSearch(
                                event.target.value
                            )
                        }
                    />

                    {search && (
                        <button
                            type="button"
                            onClick={() =>
                                setSearch("")
                            }
                        >
                            ×
                        </button>
                    )}

                </div>

                <span className="professor-request-count">
                    {filteredRequests.length}{" "}
                    {filteredRequests.length === 1
                        ? "request"
                        : "requests"}
                </span>

            </div>


            {/* =================================================
                REQUEST TABLE
            ================================================= */}

            <div className="professor-request-table-card">

                <div className="professor-request-table-wrapper">

                    <table className="professor-request-table">

                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Activity</th>
                                <th>Schedule</th>
                                <th>Items</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredRequests.length ===
                            0 ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="professor-request-empty"
                                    >
                                        <FaClipboardList />

                                        <strong>
                                            No requests found
                                        </strong>

                                        <span>
                                            Try changing your
                                            search.
                                        </span>
                                    </td>
                                </tr>
                            ) : (
                                filteredRequests.map(
                                    (request) => (
                                        <tr
                                            key={
                                                request.id
                                            }
                                        >

                                            {/* STUDENT */}

                                            <td>
                                                <div className="professor-student-cell">

                                                    <div className="professor-student-avatar">
                                                        {request.student.charAt(
                                                            0
                                                        )}
                                                    </div>

                                                    <div>
                                                        <strong>
                                                            {
                                                                request.student
                                                            }
                                                        </strong>

                                                        <span>
                                                            {
                                                                request.studentId
                                                            }
                                                        </span>
                                                    </div>

                                                </div>
                                            </td>


                                            {/* ACTIVITY */}

                                            <td>
                                                <div className="professor-activity-cell">

                                                    <strong>
                                                        {
                                                            request.activity
                                                        }
                                                    </strong>

                                                    <span>
                                                        {
                                                            request.program
                                                        }
                                                    </span>

                                                </div>
                                            </td>


                                            {/* SCHEDULE */}

                                            <td>
                                                <div className="professor-schedule-cell">

                                                    <span>
                                                        <FaCalendarAlt />
                                                        {
                                                            request.date
                                                        }
                                                    </span>

                                                    <span>
                                                        <FaClock />
                                                        {
                                                            request.time
                                                        }
                                                    </span>

                                                </div>
                                            </td>


                                            {/* ITEMS */}

                                            <td>
                                                <span className="professor-items-count">
                                                    {
                                                        request.items
                                                            .length
                                                    }{" "}
                                                    {request.items
                                                        .length ===
                                                    1
                                                        ? "item"
                                                        : "items"}
                                                </span>
                                            </td>


                                            {/* STATUS */}

                                            <td>
                                                <span
                                                    className={`professor-request-status ${
                                                        request.status.toLowerCase()
                                                    }`}
                                                >
                                                    {
                                                        request.status
                                                    }
                                                </span>
                                            </td>


                                            {/* ACTION */}

                                            <td>
                                                <button
                                                    type="button"
                                                    className="professor-review-action"
                                                    onClick={() =>
                                                        setSelectedRequest(
                                                            request
                                                        )
                                                    }
                                                >
                                                    <FaEye />
                                                    Review
                                                </button>
                                            </td>

                                        </tr>
                                    )
                                )
                            )}

                        </tbody>

                    </table>

                </div>

            </div>


            {/* =================================================
                REVIEW MODAL
            ================================================= */}

            {selectedRequest && (
                <div
                    className="professor-modal-overlay"
                    onMouseDown={() =>
                        setSelectedRequest(
                            null
                        )
                    }
                >
                    <div
                        className="professor-review-modal"
                        onMouseDown={(event) =>
                            event.stopPropagation()
                        }
                    >

                        {/* MODAL HEADER */}

                        <div className="professor-review-modal-header">

                            <div>
                                <div className="professor-page-eyebrow">
                                    BORROWING REQUEST
                                </div>

                                <h2>
                                    Review Request
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="professor-modal-close"
                                onClick={() =>
                                    setSelectedRequest(
                                        null
                                    )
                                }
                            >
                                ×
                            </button>

                        </div>


                        {/* MODAL BODY */}

                        <div className="professor-review-modal-body">

                            {/* STUDENT */}

                            <section className="professor-review-section">

                                <div className="professor-review-section-title">
                                    <FaUser />
                                    Student Information
                                </div>

                                <div className="professor-review-student">

                                    <div className="professor-review-avatar">
                                        {selectedRequest.student.charAt(
                                            0
                                        )}
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                selectedRequest.student
                                            }
                                        </strong>

                                        <span>
                                            {
                                                selectedRequest.studentId
                                            }
                                        </span>

                                        <small>
                                            {
                                                selectedRequest.program
                                            }
                                        </small>
                                    </div>

                                </div>

                            </section>


                            {/* ACTIVITY */}

                            <section className="professor-review-section">

                                <div className="professor-review-section-title">
                                    <FaCalendarAlt />
                                    Activity Details
                                </div>

                                <div className="professor-review-details">

                                    <div>
                                        <span>
                                            Activity
                                        </span>

                                        <strong>
                                            {
                                                selectedRequest.activity
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Date
                                        </span>

                                        <strong>
                                            {
                                                selectedRequest.date
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Time
                                        </span>

                                        <strong>
                                            {
                                                selectedRequest.time
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Location
                                        </span>

                                        <strong>
                                            <FaMapMarkerAlt />
                                            {
                                                selectedRequest.room
                                            }
                                        </strong>
                                    </div>

                                </div>

                            </section>


                            {/* ITEMS */}

                            <section className="professor-review-section">

                                <div className="professor-review-section-title">
                                    <FaBoxOpen />
                                    Requested Items
                                </div>

                                <div className="professor-review-items">

                                    {selectedRequest.items.map(
                                        (
                                            item,
                                            index
                                        ) => (
                                            <div
                                                className="professor-review-item"
                                                key={
                                                    index
                                                }
                                            >
                                                <span>
                                                    {
                                                        item.name
                                                    }
                                                </span>

                                                <strong>
                                                    ×{" "}
                                                    {
                                                        item.quantity
                                                    }
                                                </strong>
                                            </div>
                                        )
                                    )}

                                </div>

                            </section>


                            {/* CONFIRMATION */}

                            {selectedRequest.status ===
                                "Pending" && (
                                <section className="professor-confirmation">

                                    <div>
                                        <strong>
                                            Professor Confirmation
                                        </strong>

                                        <p>
                                            By approving this
                                            request, you confirm
                                            that the borrowing is
                                            associated with the
                                            stated academic
                                            activity.
                                        </p>
                                    </div>

                                    <label>
                                        <input
                                            type="checkbox"
                                            id="professor-confirm"
                                        />

                                        <span>
                                            I confirm this
                                            borrowing request.
                                        </span>
                                    </label>

                                </section>
                            )}

                        </div>


                        {/* MODAL FOOTER */}

                        <div className="professor-review-modal-footer">

                            <button
                                type="button"
                                className="professor-modal-secondary"
                                onClick={() =>
                                    setSelectedRequest(
                                        null
                                    )
                                }
                            >
                                Close
                            </button>

                            {selectedRequest.status ===
                                "Pending" && (
                                <>
                                    <button
                                        type="button"
                                        className="professor-modal-reject"
                                        onClick={() =>
                                            handleReject(
                                                selectedRequest
                                            )
                                        }
                                    >
                                        <FaTimes />
                                        Reject
                                    </button>

                                    <button
                                        type="button"
                                        className="professor-modal-approve"
                                        onClick={() =>
                                            handleApprove(
                                                selectedRequest
                                            )
                                        }
                                    >
                                        <FaCheck />
                                        Confirm & Sign
                                    </button>
                                </>
                            )}

                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}