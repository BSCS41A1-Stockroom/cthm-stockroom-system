
import { useEffect, useState } from "react";

import { authenticatedFetch } from "../../lib/api";

import "../../styles/authorization.css";


export default function SignatureSettings() {

    const [image, setImage] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);


    useEffect(() => {

        authenticatedFetch(
            "/api/authorizations/signature"
        )
            .then((response) => response.json())
            .then((result) => {
                setImage(result.image || "");
            })
            .catch(() => {
                setMessage(
                    "Unable to load your signature."
                );
            });

    }, []);


    const choose = (event) => {

        const file =
            event.target.files?.[0];

        if (
            !file ||
            ![
                "image/png",
                "image/jpeg"
            ].includes(file.type) ||
            file.size > 262144
        ) {
            setMessage(
                "Choose a PNG or JPEG no larger than 256 KB."
            );
            return;
        }


        const reader =
            new FileReader();


        reader.onload = () => {

            setImage(
                String(reader.result)
            );

            setMessage("");

        };


        reader.readAsDataURL(file);

    };


    const save = async () => {

        if (!image) {
            setMessage(
                "Choose your signature image first."
            );
            return;
        }


        setSaving(true);
        setMessage("");


        try {

            const response =
                await authenticatedFetch(
                    "/api/authorizations/signature",
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            image
                        }),
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    result.message ||
                    "Unable to save signature."
                );
            }


            setMessage(
                "Signature saved securely to your professor account."
            );

        } catch (error) {

            setMessage(
                error.message ||
                "Unable to save signature."
            );

        } finally {

            setSaving(false);

        }

    };


    return (

        <main className="signature-page">

            <header className="signature-page-header">

                <div className="signature-page-eyebrow">
                    Professor Authorization
                </div>

                <h1>
                    Signature Settings
                </h1>

                <p>
                    Manage the electronic signature used
                    when authorizing borrowing requests.
                </p>

            </header>


            <section className="signature-card">

                <div className="signature-card-header">

                    <div>
                        <span className="signature-card-label">
                            E-Signature
                        </span>

                        <h2>
                            Professor Signature
                        </h2>

                        <p>
                            Your signature is applied only
                            after you review and explicitly
                            authorize a request.
                        </p>
                    </div>

                    <div className="signature-status">
                        {image
                            ? "Signature Ready"
                            : "Not Set"}
                    </div>

                </div>


                <div className="signature-preview-wrapper">

                    <div className="signature-preview-label">
                        Signature Preview
                    </div>

                    <div className="signature-preview">

                        {image ? (

                            <img
                                src={image}
                                alt="Professor signature preview"
                            />

                        ) : (

                            <div className="signature-empty">

                                <span className="signature-empty-mark">
                                    ✦
                                </span>

                                <strong>
                                    No signature saved
                                </strong>

                                <small>
                                    Upload your signature
                                    image below.
                                </small>

                            </div>

                        )}

                    </div>

                </div>


                <div className="signature-upload-area">

                    <label className="signature-upload">

                        <span>
                            Choose Signature Image
                        </span>

                        <input
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={choose}
                        />

                    </label>

                    <div className="signature-file-info">

                        <strong>
                            PNG or JPEG
                        </strong>

                        <span>
                            Maximum file size: 256 KB
                        </span>

                    </div>

                </div>


                <p className="signature-help">

                    Use a transparent PNG for the cleanest
                    result. Your profile full name and
                    signing date are added automatically
                    when the signature is used for an
                    authorization.

                </p>


                {message && (

                    <div
                        className={`authorization-message ${
                            message.toLowerCase().includes("unable") ||
                            message.toLowerCase().includes("choose")
                                ? "error"
                                : "success"
                        }`}
                    >
                        {message}
                    </div>

                )}


                <div className="signature-card-footer">

                    <div className="signature-security">

                        <span className="security-icon">
                            ✓
                        </span>

                        <div>
                            <strong>
                                Secure Professor Authorization
                            </strong>

                            <small>
                                Your signature is associated
                                with your professor account.
                            </small>
                        </div>

                    </div>


                    <button
                        type="button"
                        className="signature-save-button"
                        onClick={save}
                        disabled={saving}
                    >
                        {saving
                            ? "Saving..."
                            : "Save Signature"}
                    </button>

                </div>

            </section>

        </main>

    );
}

