import { useState } from "react";
import {
    FaQrcode,
    FaCamera,
    FaKeyboard,
    FaCheckCircle,
    FaTimesCircle,
    FaSearch,
} from "react-icons/fa";

import "../../styles/professor.css";

export default function QRScanner() {
    const [mode, setMode] = useState("camera");
    const [code, setCode] = useState("");
    const [result, setResult] = useState(null);

    const handleVerify = () => {
        if (!code.trim()) return;

        // Temporary result.
        // Actual QR verification will be connected to the database later.
        setResult({
            valid: true,
            student: "Juan Dela Cruz",
            studentId: "2024-00125",
            program: "BS Hospitality Management",
            request: "Food & Beverage Laboratory",
            date: "September 20, 2026",
            time: "9:00 AM – 11:00 AM",
            status: "Pending Professor Confirmation",
        });
    };

    const clearResult = () => {
        setResult(null);
        setCode("");
    };

    return (
        <div className="professor-qr-page">

            {/* HEADER */}
            <div className="professor-page-header">
                <div>
                    <div className="professor-page-eyebrow">
                        PROFESSOR PORTAL
                    </div>

                    <h1>Student QR Verification</h1>

                    <p>
                        Scan a student's QR code to verify
                        their borrowing request.
                    </p>
                </div>
            </div>


            {/* MODE SWITCHER */}
            <div className="professor-qr-mode-bar">

                <button
                    type="button"
                    className={
                        mode === "camera"
                            ? "active"
                            : ""
                    }
                    onClick={() => {
                        setMode("camera");
                        setResult(null);
                    }}
                >
                    <FaCamera />
                    Camera Scanner
                </button>

                <button
                    type="button"
                    className={
                        mode === "manual"
                            ? "active"
                            : ""
                    }
                    onClick={() => {
                        setMode("manual");
                        setResult(null);
                    }}
                >
                    <FaKeyboard />
                    Enter QR Code
                </button>

            </div>


            <div className="professor-qr-layout">

                {/* SCANNER */}
                <div className="professor-qr-card">

                    <div className="professor-qr-card-header">
                        <div>
                            <h2>
                                {mode === "camera"
                                    ? "Scan QR Code"
                                    : "Enter QR Code"}
                            </h2>

                            <p>
                                {mode === "camera"
                                    ? "Position the student's QR code inside the scanner."
                                    : "Enter the QR code provided by the student."}
                            </p>
                        </div>

                        <FaQrcode />
                    </div>


                    {mode === "camera" ? (
                        <div className="professor-qr-camera">

                            <div className="professor-qr-frame">

                                <div className="qr-corner qr-tl" />
                                <div className="qr-corner qr-tr" />
                                <div className="qr-corner qr-bl" />
                                <div className="qr-corner qr-br" />

                                <div className="qr-scan-line" />

                                <FaQrcode />

                            </div>

                            <span>
                                Camera scanner ready
                            </span>

                            <small>
                                Allow camera access when prompted.
                            </small>

                        </div>
                    ) : (
                        <div className="professor-qr-manual">

                            <label>
                                QR Code
                            </label>

                            <div className="professor-qr-input">

                                <FaQrcode />

                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) =>
                                        setCode(
                                            e.target.value
                                        )
                                    }
                                    onKeyDown={(e) => {
                                        if (
                                            e.key ===
                                            "Enter"
                                        ) {
                                            handleVerify();
                                        }
                                    }}
                                    placeholder="Enter QR code..."
                                />

                            </div>

                            <button
                                type="button"
                                className="professor-qr-verify-btn"
                                onClick={
                                    handleVerify
                                }
                            >
                                <FaSearch />
                                Verify Code
                            </button>

                        </div>
                    )}

                </div>


                {/* RESULT */}
                <div className="professor-qr-card">

                    <div className="professor-qr-card-header">
                        <div>
                            <h2>
                                Verification Result
                            </h2>

                            <p>
                                Student and request information
                            </p>
                        </div>
                    </div>


                    {!result ? (
                        <div className="professor-qr-empty">

                            <FaQrcode />

                            <strong>
                                Waiting for QR scan
                            </strong>

                            <span>
                                Scan a student QR code to
                                display the request.
                            </span>

                        </div>
                    ) : (
                        <div className="professor-qr-result">

                            {result.valid ? (
                                <div className="professor-qr-result-status valid">
                                    <FaCheckCircle />

                                    <div>
                                        <strong>
                                            QR Code Verified
                                        </strong>

                                        <span>
                                            Student record found.
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="professor-qr-result-status invalid">
                                    <FaTimesCircle />

                                    <div>
                                        <strong>
                                            Invalid QR Code
                                        </strong>

                                        <span>
                                            No matching record found.
                                        </span>
                                    </div>
                                </div>
                            )}


                            {result.valid && (
                                <>
                                    <div className="professor-qr-student">

                                        <div className="professor-qr-avatar">
                                            {result.student.charAt(
                                                0
                                            )}
                                        </div>

                                        <div>
                                            <strong>
                                                {result.student}
                                            </strong>

                                            <span>
                                                {result.studentId}
                                            </span>

                                            <small>
                                                {result.program}
                                            </small>
                                        </div>

                                    </div>


                                    <div className="professor-qr-details">

                                        <div>
                                            <span>
                                                Activity
                                            </span>

                                            <strong>
                                                {result.request}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                Date
                                            </span>

                                            <strong>
                                                {result.date}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                Time
                                            </span>

                                            <strong>
                                                {result.time}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                Status
                                            </span>

                                            <strong>
                                                {result.status}
                                            </strong>
                                        </div>

                                    </div>


                                    <div className="professor-qr-result-actions">

                                        <button
                                            type="button"
                                            className="professor-qr-clear"
                                            onClick={
                                                clearResult
                                            }
                                        >
                                            Scan Another
                                        </button>

                                    </div>
                                </>
                            )}

                        </div>
                    )}

                </div>

            </div>

        </div>
    );
}